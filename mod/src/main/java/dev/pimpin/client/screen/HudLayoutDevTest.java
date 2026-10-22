package dev.pimpin.client.screen;

import dev.pimpin.client.PimpinClient;
import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.hud.HudLayout;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.world.level.storage.LevelResource;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;

/** Explicit, isolated development fixture. Drives real handlers, not physical OS input. */
public final class HudLayoutDevTest {
    private static final boolean ENABLED=FabricLoader.getInstance().isDevelopmentEnvironment() && Boolean.getBoolean("pimpin.dev.hudLayoutTest");
    private static int ticks,checks;
    private HudLayoutDevTest() {}
    private static void check(boolean ok,String message) {
        if(!ok) throw new IllegalStateException("HUD_LAYOUT_TEST FAILED: "+message);
        checks++;PimpinClient.LOG.info("HUD_LAYOUT_TEST PASS: {}",message);
    }
    private static Field field(Class<?> type,String name) throws Exception {Field f=type.getDeclaredField(name);f.setAccessible(true);return f;}
    private static void rebuild(Object screen) throws Exception {
        Class<?> type=screen.getClass();
        while(type!=null) {
            try {var method=type.getDeclaredMethod("rebuildWidgets");method.setAccessible(true);method.invoke(screen);return;}
            catch(NoSuchMethodException ignored) {type=type.getSuperclass();}
        }
        throw new IllegalStateException("No rebuildWidgets");
    }
    private static void scale(Minecraft mc,int scale) throws Exception {
        mc.options.guiScale().set(scale);
        mc.getClass().getMethod("resizeDisplay").invoke(mc);
    }
    private static void test(Minecraft mc) throws Exception {
        var c=PimpinConfig.get();
        check(c.hudLayout==null,"legacy config retains settings without custom layout");
        c.effectHud=true;c.hudOpacity=70;
        for(int[] viewport:new int[][]{{320,180},{426,240},{640,360},{1280,720}}) {
            for(int tab=0;tab<5;tab++) {
                field(PimpinSettingsScreen.class,"tab").setInt(null,tab);
                var screen=new PimpinSettingsScreen(null);Compat.setScreen(mc,screen);
                screen.width=viewport[0];screen.height=viewport[1];rebuild(screen);
                int pages=field(PimpinSettingsScreen.class,"pageCount").getInt(screen);
                for(int page=0;page<pages;page++) {
                    field(PimpinSettingsScreen.class,"page").setInt(screen,page);rebuild(screen);
                    List<AbstractWidget> widgets=new ArrayList<>();
                    for(var child:screen.children()) if(child instanceof AbstractWidget w) widgets.add(w);
                    boolean fits=true,overlap=false;
                    for(int i=0;i<widgets.size();i++) {
                        var a=widgets.get(i);
                        fits &= a.getX()>=0 && a.getY()>=0 && a.getX()+a.getWidth()<=screen.width && a.getY()+a.getHeight()<=screen.height;
                        if(a.active) {screen.setFocused(a);fits &= screen.getFocused()==a;}
                        for(int j=0;j<i;j++) {var b=widgets.get(j);overlap |= a.getX()<b.getX()+b.getWidth() && a.getX()+a.getWidth()>b.getX() && a.getY()<b.getY()+b.getHeight() && a.getY()+a.getHeight()>b.getY();}
                    }
                    screen.setFocused(null);
                    check(screen.nextFocusPath(new net.minecraft.client.gui.navigation.FocusNavigationEvent.TabNavigation(true))!=null,"keyboard Tab focus path");
                    check(fits && !overlap,"settings bounds + focus "+viewport[0]+"x"+viewport[1]+" tab "+tab+" page "+page);
                }
                if(pages>1) {
                    field(PimpinSettingsScreen.class,"page").setInt(screen,0);rebuild(screen);
                    screen.onScroll(100,100,-1);
                    check(field(PimpinSettingsScreen.class,"page").getInt(screen)==1,"scroll navigates next page");
                }
            }
        }
        field(PimpinSettingsScreen.class,"tab").setInt(null,0);
        var settings=new PimpinSettingsScreen(null);Compat.setScreen(mc,settings);
        for(var child:settings.children()) if(child instanceof Button button && button.getMessage().getString().startsWith("HUD layout")) {
            Compat.press(button);
        }
        check(Compat.screen(mc) instanceof HudEditorScreen,"settings button opens editor");
        var editor=new HudEditorScreen(null);Compat.setScreen(mc,editor);
        var before=HudLayout.copy(HudLayout.current());
        for(int id=0;id<5;id++) {
            // Separate targets so overlap does not hide the block being exercised.
            var draft=(PimpinConfig.Placement[])field(HudEditorScreen.class,"draft").get(editor);
            for(int j=0;j<5;j++){draft[j].x=1;draft[j].y=1;}
            draft[id].x=.2f;draft[id].y=.2f;
            int[] b=editor.bounds(id);
            check(editor.onClick(b[0]+5,b[1]+5,0),"select module "+id);
            check(editor.onDrag(-100,-100,0,-200,-200),"drag module "+id);
            check(editor.onRelease(-100,-100,0),"release module "+id);
            b=editor.bounds(id);check(b[0]>=4 && b[1]>=4,"module clamp "+id);
            check(editor.onClick(b[0]+b[2],b[1]+b[3],0),"resize handle "+id);
            editor.onDrag(b[0]+b[2]+60,b[1]+b[3]+40,0,60,40);editor.onRelease(0,0,0);
            check(draft[id].scale>before[id].scale,"independent resize "+id);
        }
        editor.onClose();check(c.hudLayout==null,"cancel leaves config unchanged");
        editor=new HudEditorScreen(null);Compat.setScreen(mc,editor);
        editor.onClick(editor.bounds(1)[0]+5,editor.bounds(1)[1]+5,0);editor.onScroll(0,0,1);editor.saveLayout();
        check(c.hudLayout!=null,"Save persists all five modules");
        float saved=c.hudLayout[1].scale;PimpinConfig.load();c=PimpinConfig.get();
        check(c.hudLayout[1].scale==saved && c.hudOpacity==70,"save/reload preserves layout and controls");
        var snapProbe=new PimpinConfig.Placement(0,0,1);
        HudLayout.move(snapProbe,37,53,640,360,70,74,true);
        int[] snapped=HudLayout.bounds(snapProbe,640,360,70,74);
        check(snapped[0]%8==0 && snapped[1]%8==0,"snap aligns dragged panel to eight-pixel grid");
        editor=new HudEditorScreen(null);Compat.setScreen(mc,editor);editor.resetDraft();editor.onClose();
        check(c.hudLayout[1].scale==saved,"Reset then Cancel does not commit reset");
        editor=new HudEditorScreen(null);Compat.setScreen(mc,editor);editor.resetDraft();editor.saveLayout();PimpinConfig.load();c=PimpinConfig.get();
        check(c.hudLayout[1].scale==c.hudScale,"Reset then Save commits defaults");
        for(int[] viewport:new int[][]{{320,180},{640,360},{1280,720}}) for(int id=0;id<5;id++) {
            var p=new PimpinConfig.Placement(-100,100,2.5f);int[] b=HudLayout.bounds(p,viewport[0],viewport[1],300,180);
            check(b[0]>=0 && b[1]>=0 && b[0]+b[2]<=viewport[0] && b[1]+b[3]<=viewport[1],"scale fit "+viewport[0]+" module "+id);
        }
        c.hudLayout=null; // Clean defaults for the actual screenshots.
        scale(mc,2);
        editor=new HudEditorScreen(null);Compat.setScreen(mc,editor);
        int[] keyBounds=editor.bounds(1);
        editor.onClick(keyBounds[0]+8,keyBounds[1]+8,0);
        editor.onDrag(keyBounds[0]+24,keyBounds[1]+16,0,16,8);
        editor.onRelease(keyBounds[0]+24,keyBounds[1]+16,0);
    }
    public static void tick(Minecraft mc) {
        if(!ENABLED || mc.player==null || mc.getSingleplayerServer()==null) return;
        var directory=mc.gameDirectory.toPath().toAbsolutePath().normalize();
        if(!directory.getParent().endsWith("run") || !directory.getParent().getParent().endsWith("mod")) return;
        if(!mc.getSingleplayerServer().getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize().endsWith("PimpinHudLayoutTest")) return;
        try {
            switch(++ticks) {
                case 20 -> {
                    var id=mc.player.getUUID();
                    mc.getSingleplayerServer().execute(()->{
                        var player=mc.getSingleplayerServer().getPlayerList().getPlayer(id);
                        if(player==null) return;
                        player.addEffect(new net.minecraft.world.effect.MobEffectInstance(net.minecraft.world.effect.MobEffects.REGENERATION,1200,1,false,false));
                        var slots=new net.minecraft.world.entity.EquipmentSlot[]{net.minecraft.world.entity.EquipmentSlot.HEAD,net.minecraft.world.entity.EquipmentSlot.CHEST,net.minecraft.world.entity.EquipmentSlot.LEGS,net.minecraft.world.entity.EquipmentSlot.FEET,net.minecraft.world.entity.EquipmentSlot.MAINHAND};
                        var items=new net.minecraft.world.item.Item[]{net.minecraft.world.item.Items.IRON_HELMET,net.minecraft.world.item.Items.IRON_CHESTPLATE,net.minecraft.world.item.Items.IRON_LEGGINGS,net.minecraft.world.item.Items.IRON_BOOTS,net.minecraft.world.item.Items.DIAMOND_SWORD};
                        for(int i=0;i<slots.length;i++){var stack=new net.minecraft.world.item.ItemStack(items[i]);stack.setDamageValue(13);player.setItemSlot(slots[i],stack);}
                    });
                }
                case 40 -> test(mc);
                case 65 -> shot(mc,"hud-layout-editor");
                case 85 -> {scale(mc,4);field(PimpinSettingsScreen.class,"tab").setInt(null,0);Compat.setScreen(mc,new PimpinSettingsScreen(null));}
                case 105 -> shot(mc,"hud-settings-small");
                case 125 -> {field(PimpinSettingsScreen.class,"tab").setInt(null,1);Compat.setScreen(mc,new PimpinSettingsScreen(null));}
                case 145 -> shot(mc,"hud-minimap-settings-small");
                case 165 -> {scale(mc,2);Compat.setScreen(mc,null);}
                case 185 -> shot(mc,"hud-minimap-live");
                case 205 -> {PimpinConfig.save();PimpinClient.LOG.info("HUD_LAYOUT_TEST COMPLETE: {} assertions (handler automation, not physical input)",checks);mc.stop();}
            }
        } catch(Exception e) {throw new IllegalStateException("HUD_LAYOUT_TEST FAILED",e);}
    }
    private static void shot(Minecraft mc,String name) {
        //#if MC >= 26.2
        Screenshot.grab(mc.gameDirectory,name+".png",mc.gameRenderer.mainRenderTarget(),1,message->PimpinClient.LOG.info("HUD_LAYOUT_SCREENSHOT {}",name));
        //#elseif MC >= 1.21.6
        Screenshot.grab(mc.gameDirectory,name+".png",mc.getMainRenderTarget(),1,message->PimpinClient.LOG.info("HUD_LAYOUT_SCREENSHOT {}",name));
        //#else
        Screenshot.grab(mc.gameDirectory,name+".png",mc.getMainRenderTarget(),message->PimpinClient.LOG.info("HUD_LAYOUT_SCREENSHOT {}",name));
        //#endif
    }
}
