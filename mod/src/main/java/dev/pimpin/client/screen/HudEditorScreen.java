package dev.pimpin.client.screen;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.PimpinConfig.Placement;
import dev.pimpin.client.compat.BaseScreen;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.compat.Draw;
import dev.pimpin.client.hud.HudLayout;
import dev.pimpin.client.hud.Minimap;
import dev.pimpin.client.hud.PimpinHud;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Mouse layout editor. All edits stay in a draft until Save; Escape is Cancel. */
public final class HudEditorScreen extends BaseScreen {
    private final Screen parent;
    private Placement[] draft;
    private boolean snap;
    private int selected = -1;
    private boolean dragging, resizing;
    private double offsetX, offsetY, startX, startY;
    private float startScale;
    private int startW, startH, resizeX, resizeY;

    public HudEditorScreen(Screen parent) {
        super(Component.literal("HUD layout"));
        this.parent=parent;
        draft=HudLayout.copy(HudLayout.current());
        snap=PimpinConfig.get().hudSnap;
    }
    @Override protected void init() {
        dragging=false;
        int gap=4, bw=Math.min(68,(width-24)/5), x=(width-(bw*5+gap*4))/2, y=height-26;
        addRenderableWidget(Button.builder(Component.literal("Save"),b->saveLayout()).bounds(x,y,bw,20).build());
        addRenderableWidget(Button.builder(Component.literal("Cancel"),b->onClose()).bounds(x+bw+gap,y,bw,20).build());
        addRenderableWidget(Button.builder(Component.literal("Reset"),b->resetDraft()).bounds(x+2*(bw+gap),y,bw,20).build());
        addRenderableWidget(Button.builder(Component.literal("Snap: "+(snap?"ON":"OFF")),b->{snap=!snap;b.setMessage(Component.literal("Snap: "+(snap?"ON":"OFF")));}).bounds(x+3*(bw+gap),y,bw,20).build());
        addRenderableWidget(Button.builder(Component.literal("Other HUDs"),b->Compat.setScreen(minecraft,new ForeignHudsScreen(this))).bounds(x+4*(bw+gap),y,bw,20)
                .tooltip(Tooltip.create(Component.literal("Move, scale or hide HUDs other mods draw"))).build());
    }
    public void resetDraft() { draft=HudLayout.defaults(); selected=-1; dragging=false; }
    public void saveLayout() {
        PimpinConfig.get().hudLayout=HudLayout.copy(draft);
        PimpinConfig.get().hudSnap=snap;
        PimpinConfig.save();
        Compat.setScreen(minecraft,parent);
    }
    @Override public void onClose() { dragging=false; Compat.setScreen(minecraft,parent); }
    public int[] bounds(int id) {
        int[] size=PimpinHud.moduleSize(id,minecraft,true);
        return HudLayout.bounds(draft[id],width,height,size[0],size[1]);
    }
    @Override protected boolean onClick(double x,double y,int button) {
        if(button!=0) return false;
        for(var child:children()) if(child instanceof Button b && b.isMouseOver(x,y)) return false;
        // Selected resize handle wins even when another module overlaps it.
        if(selected>=0 && handle(bounds(selected),x,y)) { begin(x,y,true); return true; }
        for(int id=4;id>=0;id--) {
            int[] b=bounds(id);
            if(x>=b[0]-2 && x<=b[0]+b[2]+2 && y>=b[1]-2 && y<=b[1]+b[3]+2) {
                selected=id; begin(x,y,handle(b,x,y)); return true;
            }
        }
        selected=-1; return false;
    }
    private boolean handle(int[] b,double x,double y) {
        return Math.abs(x-(b[0]+b[2]))<=7 && Math.abs(y-(b[1]+b[3]))<=7;
    }
    private void begin(double x,double y,boolean resize) {
        int[] b=bounds(selected);
        dragging=true;resizing=resize;offsetX=x-b[0];offsetY=y-b[1];
        startX=x;startY=y;startScale=draft[selected].scale;startW=b[2];startH=b[3];resizeX=b[0];resizeY=b[1];
    }
    @Override protected boolean onDrag(double x,double y,int button,double dx,double dy) {
        if(!dragging || selected<0 || button!=0) return false;
        Placement p=draft[selected];
        if(resizing) {
            double ratio=Math.max((startW+x-startX)/startW,(startH+y-startY)/startH);
            p.scale=HudLayout.clamp((float)(startScale*ratio),.5f,2.5f);
            int[] size=PimpinHud.moduleSize(selected,minecraft,true);
            HudLayout.move(p,resizeX,resizeY,width,height,size[0],size[1],false);
        } else {
            int[] size=PimpinHud.moduleSize(selected,minecraft,true);
            HudLayout.move(p,(float)(x-offsetX),(float)(y-offsetY),width,height,size[0],size[1],snap);
        }
        return true;
    }
    @Override protected boolean onRelease(double x,double y,int button) {
        if(button!=0 || !dragging) return false;
        dragging=false;return true;
    }
    @Override protected boolean onScroll(double x,double y,double amount) {
        if(selected<0 || amount==0) return false;
        int[] b=bounds(selected),size=PimpinHud.moduleSize(selected,minecraft,true);
        draft[selected].scale=HudLayout.clamp(draft[selected].scale+(amount>0?.1f:-.1f),.5f,2.5f);
        HudLayout.move(draft[selected],b[0],b[1],width,height,size[0],size[1],false);
        return true;
    }
    @Override protected void draw(Draw g,int mx,int my,float delta) {
        HudLayout.preview=draft;
        try {
            PimpinHud.renderModules(g,minecraft,true);
            if(minecraft.player!=null && PimpinConfig.get().minimap) Minimap.render(g,minecraft);
            else {
                int[] b=bounds(4);g.fill(b[0],b[1],b[0]+b[2],b[1]+b[3],0xB0252932);
                g.centered(font,"Minimap preview",b[0]+b[2]/2,b[1]+b[3]/2,0xFFFFFFFF);
            }
        } finally { HudLayout.preview=null; }
        for(int id=0;id<5;id++) {
            int[] b=bounds(id);int x=b[0],y=b[1],w=b[2],h=b[3],color=id==selected?0xFFFFD580:0xFFB49BD7;
            g.fill(x-1,y-1,x+w+1,y,color);g.fill(x-1,y+h,x+w+1,y+h+1,color);
            g.fill(x-1,y,x,y+h,color);g.fill(x+w,y,x+w+1,y+h,color);
            g.fill(x+w-4,y+h-4,x+w+4,y+h+4,color);
            String label=HudLayout.NAMES[id];
            int ly=y>=12?y-10:Math.min(height-10,y+h+2);
            g.fill(x,ly-1,x+font.width(label)+4,ly+9,0xDA17171F);
            g.text(font,label,x+2,ly,color);
        }
        String tip=selected<0?"Drag a panel | Corner / scroll: resize":HudLayout.NAMES[selected]+" "+Math.round(draft[selected].scale*100)+"% | Corner / scroll: resize";
        int tipW=font.width(tip);
        g.fill((width-tipW)/2-5,height-42,(width+tipW)/2+5,height-29,0xE0181820);
        g.centered(font,tip,width/2,height-40,0xFFFFFFFF);
        drawWidgetsOnTop(g,mx,my,delta);
    }
    @Override public boolean isPauseScreen() { return false; }
}
