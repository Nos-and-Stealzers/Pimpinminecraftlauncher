package dev.pimpin.client.hud;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.PimpinConfig.Placement;

/** Anchors are fractions of remaining space, not raw pixels: GUI-scale safe. */
public final class HudLayout {
    public static final String[] NAMES = {"Information", "Keystrokes", "Armor", "Effects", "Minimap"};
    public static Placement[] preview;
    private HudLayout() {}
    public static Placement[] defaults() {
        PimpinConfig c = PimpinConfig.get();
        boolean right = c.hudCorner == 1 || c.hudCorner == 3;
        boolean bottom = c.hudCorner >= 2;
        return new Placement[]{new Placement(right ? 1 : 0, bottom ? .65f : 0, c.hudScale),
            new Placement(right ? 1 : 0, bottom ? 1 : .35f, c.hudScale),
            new Placement(1, 1, 1), new Placement(right ? 1 : 0, bottom ? .3f : .7f, c.hudScale),
            new Placement(c.minimapCorner % 2 == 1 ? 1 : 0, c.minimapCorner >= 2 ? 1 : 0, 1)};
    }
    public static Placement[] copy(Placement[] source) {
        Placement[] copy = new Placement[5];
        for (int i = 0; i < 5; i++) copy[i] = source[i].copy();
        return copy;
    }
    public static Placement[] current() {
        if (preview != null) return preview;
        return PimpinConfig.get().hudLayout == null ? defaults() : PimpinConfig.get().hudLayout;
    }
    public static float clamp(float n, float lo, float hi) { return Float.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; }
    public static int[] bounds(int id, int sw, int sh, int baseW, int baseH) {
        return bounds(current()[id], sw, sh, baseW, baseH);
    }
    public static int[] bounds(Placement p, int sw, int sh, int baseW, int baseH) {
        float s = effectiveScale(p, sw, sh, baseW, baseH);
        int w = Math.max(1, (int)Math.ceil(baseW*s)), h = Math.max(1, (int)Math.ceil(baseH*s));
        int x = 4 + Math.round(clamp(p.x, 0, 1) * Math.max(0, sw - w - 8));
        int y = 4 + Math.round(clamp(p.y, 0, 1) * Math.max(0, sh - h - 8));
        return new int[]{x,y,w,h};
    }
    public static float effectiveScale(Placement p, int sw, int sh, int w, int h) {
        return Math.max(.05f, Math.min(clamp(p.scale,.5f,2.5f), Math.min((sw-8f)/Math.max(1,w),(sh-8f)/Math.max(1,h))));
    }
    public static void move(Placement p, float x, float y, int sw, int sh, int bw, int bh, boolean snap) {
        int[] b = bounds(p,sw,sh,bw,bh);
        if (snap) { x = Math.round(x / 8) * 8; y = Math.round(y / 8) * 8; }
        p.x = clamp((x-4)/Math.max(1,sw-b[2]-8f),0,1);
        p.y = clamp((y-4)/Math.max(1,sh-b[3]-8f),0,1);
    }
    public static int background() { return (Math.round(PimpinConfig.get().hudOpacity*2.55f)<<24) | 0x101018; }
}
