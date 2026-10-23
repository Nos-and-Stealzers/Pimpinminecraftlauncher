package dev.pimpin.client.screen;

import com.google.gson.Gson;
import dev.pimpin.client.PimpinClient;
import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.feature.Coordinates;
import dev.pimpin.client.hud.EquipmentHud;
import dev.pimpin.client.hud.HudLayout;
import dev.pimpin.client.hud.PimpinHud;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.LevelResource;
import java.lang.reflect.Field;
import java.util.Set;

/** Injected only by equipment-coordinate-test.py; not a shipped client entrypoint. */
public final class EquipmentQolDevTest implements ClientModInitializer {
    private static int ticks, checks;
    private static boolean started, disconnected;
    private static String layout;
    @Override public void onInitializeClient() {
        if (FabricLoader.getInstance().isDevelopmentEnvironment() && Boolean.getBoolean("pimpin.dev.equipmentTest"))
            ClientTickEvents.END_CLIENT_TICK.register(EquipmentQolDevTest::tick);
    }
    private static void check(boolean ok, String message) {
        if (!ok) throw new IllegalStateException("EQUIPMENT_QOL_TEST FAILED: " + message);
        checks++; PimpinClient.LOG.info("EQUIPMENT_QOL_TEST PASS: {}", message);
    }
    private static Field field(Class<?> c, String name) throws Exception { var f=c.getDeclaredField(name); f.setAccessible(true); return f; }
    private static Button button(net.minecraft.client.gui.screens.Screen screen, String prefix) {
        for (var child:screen.children()) if (child instanceof Button b && b.getMessage().getString().startsWith(prefix)) return b;
        throw new IllegalStateException("Missing button " + prefix);
    }
    private static void pressSetting(Minecraft mc, int tab, String prefix) throws Exception {
        field(PimpinSettingsScreen.class,"tab").setInt(null,tab);
        var s=new PimpinSettingsScreen(null); Compat.setScreen(mc,s);
        int pages=field(PimpinSettingsScreen.class,"pageCount").getInt(s);
        for (int page=0;page<pages;page++) {
            for(var child:s.children()) if(child instanceof Button b && b.getMessage().getString().startsWith(prefix)) { Compat.press(b); return; }
            if(page+1<pages) Compat.press(button(s,">"));
        }
        throw new IllegalStateException("Missing setting " + prefix);
    }
    private static void clipboard(Minecraft mc, boolean converted) {
        String old=mc.keyboardHandler.getClipboard();
        try {
            var screen=new CoordinatesScreen(null);Compat.setScreen(mc,screen);
            String expected=Coordinates.text(mc,converted);
            Compat.press(button(screen,converted?"Copy Nether":"Copy current"));
            check(expected.equals(mc.keyboardHandler.getClipboard()),"real clipboard exact " + (converted?"destination":"current"));
        } finally { Compat.copyText(mc,old); }
    }
    private static void test(Minecraft mc) throws Exception {
        var c=PimpinConfig.get();
        check(c.armorHud && c.armorReadout==0 && c.armorMainHand && !c.armorOffHand && c.armorWarningPercent==0,"legacy equipment defaults preserved; new warning opt-in");
        check(c.showBiome && !c.minimap && c.hudLayout.length==5,"existing preferences and five layout entries retained");
        layout=new Gson().toJson(c.hudLayout);
        check(EquipmentHud.items(mc,false).size()==5,"server equipment synchronized, existing held slot included");
        pressSetting(mc,0,"Durability text"); check(c.armorReadout==1,"actual setting selects percent");
        check(EquipmentHud.readout(mc.player.getMainHandItem()).equals("75%"),"live percent readout");
        pressSetting(mc,0,"Durability text"); check(c.armorReadout==2,"actual setting selects both");
        check(EquipmentHud.readout(mc.player.getMainHandItem()).contains(" (75%)"),"live both readout");
        pressSetting(mc,0,"Durability text");check(c.armorReadout==0,"actual setting cycles back to remaining");
        pressSetting(mc,0,"Offhand in armour HUD");check(c.armorOffHand && EquipmentHud.items(mc,false).size()==6,"offhand included via actual setting");
        pressSetting(mc,0,"Held item in armour HUD");check(!c.armorMainHand && EquipmentHud.items(mc,false).size()==5,"held item can be excluded");
        pressSetting(mc,0,"Held item in armour HUD");
        pressSetting(mc,0,"Low durability warning");pressSetting(mc,0,"Low durability warning");
        check(c.armorWarningPercent==10 && EquipmentHud.low(mc.player.getOffhandItem()),"configured low shield warning");
        check(EquipmentHud.readout(mc.player.getOffhandItem()).startsWith("! "),"warning has explicit non-colour cue");
        c.armorWarningPercent=0;check(!EquipmentHud.low(mc.player.getOffhandItem()) && !EquipmentHud.readout(mc.player.getOffhandItem()).startsWith("!"),"disabled warning has no alert");
        c.armorReadout=2;c.armorWarningPercent=10;
        check(PimpinHud.moduleSize(2,mc,false)[1]>=108,"existing armour panel grows to fit six slots");
        check(PimpinHud.moduleSize(2,mc,false)[0]>=22+mc.font.width(EquipmentHud.readout(mc.player.getMainHandItem())),"both readout width fits full text");
        check(HudLayout.current().length==5 && layout.equals(new Gson().toJson(c.hudLayout)),"new options do not replace layout");
        PimpinConfig.save();PimpinConfig.load();c=PimpinConfig.get();
        check(c.armorReadout==2 && c.armorOffHand && c.armorWarningPercent==10 && c.showBiome && !c.minimap,"new and old settings survive persistence");
        check(layout.equals(new Gson().toJson(c.hudLayout)),"layout round trip unchanged");
        pressSetting(mc,4,"Copy coordinates");check(Compat.screen(mc) instanceof CoordinatesScreen,"Quality of life opens coordinate utility");
        clipboard(mc,false);clipboard(mc,true);
        for(int[] vp:new int[][]{{320,180},{426,240},{640,360}}) {
            var s=new CoordinatesScreen(null);Compat.setScreen(mc,s);Compat.resizeScreen(s,mc,vp[0],vp[1]);
            boolean fits=true;
            for(var a:s.children()) if(a instanceof AbstractWidget w) fits &= w.getX()>=0 && w.getY()>=0 && w.getX()+w.getWidth()<=vp[0] && w.getY()+w.getHeight()<=vp[1];
            check(fits,"coordinate buttons fit " + vp[0]+"x"+vp[1]);
        }
        mc.options.guiScale().set(2);mc.resizeDisplay();Compat.setScreen(mc,null);
    }
    private static void travel(Minecraft mc, net.minecraft.resources.ResourceKey<Level> dimension) {
        var server=mc.getSingleplayerServer();var id=mc.player.getUUID();
        server.execute(()->{
            var p=server.getPlayerList().getPlayer(id);
            p.setInvulnerable(true);p.setNoGravity(true);
            p.teleportTo(server.getLevel(dimension),15.5,120,-10.1,Set.of(),0,0,true);
        });
    }
    private static void tick(Minecraft mc) {
        if (!started) {
            if(mc.player==null || mc.getSingleplayerServer()==null) return;
            var dir=mc.gameDirectory.toPath().toAbsolutePath().normalize();
            if(!dir.endsWith("equipment-qol-1.21.4") || !dir.getParent().endsWith("run") || !dir.getParent().getParent().endsWith("mod")) return;
            if(!mc.getSingleplayerServer().getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize().endsWith("PimpinEquipmentQolTest")) return;
            started=true;
        }
        try {
            mc.getToastManager().clear(); // Keep vanilla advancement toasts out of UI evidence.
            switch(++ticks) {
                case 20 -> {
                    var id=mc.player.getUUID();var server=mc.getSingleplayerServer();
                    server.execute(()->{
                        var p=server.getPlayerList().getPlayer(id);p.setInvulnerable(true);p.setNoGravity(true);
                        var slots=new EquipmentSlot[]{EquipmentSlot.HEAD,EquipmentSlot.CHEST,EquipmentSlot.LEGS,EquipmentSlot.FEET,EquipmentSlot.MAINHAND,EquipmentSlot.OFFHAND};
                        var types=new net.minecraft.world.item.Item[]{Items.IRON_HELMET,Items.IRON_CHESTPLATE,Items.IRON_LEGGINGS,Items.IRON_BOOTS,Items.DIAMOND_PICKAXE,Items.SHIELD};
                        for(int i=0;i<slots.length;i++){var stack=new ItemStack(types[i]);stack.setDamageValue(i==5?stack.getMaxDamage()-2:stack.getMaxDamage()/4);p.setItemSlot(slots[i],stack);}
                    });
                }
                case 60 -> test(mc);
                case 85 -> shot(mc,"equipment-both-warning");
                case 100 -> {PimpinConfig.get().armorReadout=1;PimpinConfig.get().armorWarningPercent=0;}
                case 120 -> shot(mc,"equipment-percent-quiet");
                case 135 -> {PimpinConfig.get().armorReadout=0;PimpinConfig.get().armorWarningPercent=10;}
                case 155 -> shot(mc,"equipment-remaining-warning");
                case 170 -> {
                    var id=mc.player.getUUID();var server=mc.getSingleplayerServer();
                    server.execute(()->{
                        var p=server.getPlayerList().getPlayer(id);
                        p.setItemSlot(EquipmentSlot.MAINHAND,new ItemStack(Items.COBBLESTONE,32));
                        p.setItemSlot(EquipmentSlot.OFFHAND,new ItemStack(Items.SHIELD));
                    });
                    PimpinConfig.get().armorReadout=2;Compat.setScreen(mc,new HudEditorScreen(null));
                }
                case 200 -> {
                    check(!EquipmentHud.low(mc.player.getOffhandItem()),"repaired offhand warning clears without cached alert");
                    check(EquipmentHud.readout(mc.player.getMainHandItem()).isEmpty(),"non-damageable held item has no bogus durability");
                    check(EquipmentHud.items(mc,false).size()==6,"non-damageable hand equipment still included");
                }
                case 190 -> shot(mc,"equipment-layout-preview");
                case 205 -> {mc.options.guiScale().set(4);mc.resizeDisplay();Compat.setScreen(mc,new CoordinatesScreen(null));}
                case 225 -> shot(mc,"equipment-coordinates-small");
                case 240 -> {Compat.setScreen(mc,null);travel(mc,Level.NETHER);}
                case 290 -> {
                    check(mc.level.dimension().equals(Level.NETHER),"actual disposable Nether travel");
                    check(Coordinates.text(mc,false).startsWith("Nether:"),"dimension label updates after travel");
                    check(Coordinates.text(mc,true).startsWith("Overworld:"),"Nether destination uses Overworld label");
                    String old=mc.keyboardHandler.getClipboard();
                    try {check(Coordinates.copy(mc,true) && mc.keyboardHandler.getClipboard().equals(Coordinates.text(mc,true)),"real Nether converted clipboard");}
                    finally {Compat.copyText(mc,old);}
                    Compat.setScreen(mc,new CoordinatesScreen(null));
                }
                case 310 -> shot(mc,"equipment-coordinates-nether");
                case 325 -> {Compat.setScreen(mc,null);travel(mc,Level.END);}
                case 375 -> {
                    check(mc.level.dimension().equals(Level.END),"actual disposable End travel");
                    check(Coordinates.text(mc,false).startsWith("The End:") && Coordinates.text(mc,true)==null,"End current works; conversion unavailable");
                    var s=new CoordinatesScreen(null);Compat.setScreen(mc,s);
                    check(!button(s,"No destination").active,"End destination button disabled");
                }
                case 395 -> shot(mc,"equipment-coordinates-end");
                case 410 -> {
                    mc.level.disconnect();mc.disconnect();disconnected=true;
                    var s=new CoordinatesScreen(null);Compat.setScreen(mc,s);
                    String old=mc.keyboardHandler.getClipboard();
                    check(Coordinates.text(mc,false)==null && !Coordinates.copy(mc,false) && old.equals(mc.keyboardHandler.getClipboard()),"actual disconnect cannot copy stale location");
                    check(!button(s,"Copy current").active && !button(s,"No destination").active,"coordinate actions disabled after disconnect");
                    check(PimpinHud.information(mc,false).isEmpty(),"disconnect clears cached HUD information");
                }
                case 430 -> {check(disconnected,"completed actual lifecycle test");PimpinClient.LOG.info("EQUIPMENT_QOL_TEST COMPLETE: {} assertions",checks);mc.stop();}
            }
        } catch(Exception e) {throw new IllegalStateException("EQUIPMENT_QOL_TEST FAILED",e);}
    }
    private static void shot(Minecraft mc,String name) {
        Screenshot.grab(mc.gameDirectory,name+".png",mc.getMainRenderTarget(),m->PimpinClient.LOG.info("EQUIPMENT_QOL_SCREENSHOT {}",name));
    }
}
