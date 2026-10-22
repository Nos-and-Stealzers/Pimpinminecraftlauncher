package dev.pimpin.client.hud;

import dev.pimpin.client.PimpinClient;
import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.compat.DynTex;
import dev.pimpin.client.feature.DeathTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import dev.pimpin.client.compat.Draw;
import dev.pimpin.client.feature.Waypoints;
import net.minecraft.core.BlockPos;

import java.util.List;

/**
 * Corner minimap plus a big map you hold a key for. Terrain comes from {@link MapTiles}
 * (scanned in the background with a time budget), drawing from {@link MapView}.
 */
public final class Minimap {
    /** Texels per block, close to far. */
    public static final float[] ZOOMS = {4f, 2f, 1f, 0.5f, 0.25f};
    public static final String[] ZOOM_NAMES = {"Very close", "Close", "Normal", "Far", "Very far"};

    private static final MapView SMALL = new MapView("mini");
    private static final MapView BIG = new MapView("big");
    private static int bigZoom = 2;
    private static String toast;
    private static long toastUntil;

    private Minimap() {}

    public static boolean bigMapOpen(Minecraft mc) {
        return PimpinClient.bigMapKey != null && PimpinClient.bigMapKey.isDown() && Compat.screen(mc) == null && mc.player != null;
    }

    public static void tick(Minecraft mc) {
        PimpinConfig c = PimpinConfig.get();
        if (mc.player == null || mc.level == null) return;
        boolean big = bigMapOpen(mc);
        if (!c.minimap && !big) return;
        float zoom = big ? ZOOMS[bigZoom] : ZOOMS[c.mapZoom];
        int res = big ? 256 : smallRes(c);
        int radius = (int) Math.ceil(res / 2.0 / zoom * 1.42 / 16) + 1;
        int renderDistance = mc.options.getEffectiveRenderDistance();
        MapTiles.update(mc, Math.min(radius, renderDistance + 1), c.minimapCaves);
    }

    private static int smallRes(PimpinConfig c) {
        return Math.min(256, c.minimapSize * 2);
    }

    public static void cycleZoom(Minecraft mc) {
        PimpinConfig c = PimpinConfig.get();
        c.mapZoom = (c.mapZoom + 1) % ZOOMS.length;
        PimpinConfig.save();
        showToast("Minimap: " + ZOOM_NAMES[c.mapZoom]);
    }

    /** Scroll while the big map is open to zoom it. Returns true when the scroll was used. */
    public static boolean onScroll(double amount) {
        Minecraft mc = Minecraft.getInstance();
        if (!bigMapOpen(mc)) return false;
        bigZoom = Math.max(0, Math.min(ZOOMS.length - 1, bigZoom + (amount > 0 ? -1 : 1)));
        return true;
    }

    private static void showToast(String text) {
        toast = text;
        toastUntil = System.currentTimeMillis() + 1500;
    }

    /** Size and corner of the minimap on screen: {x, y, size}. */
    public static int[] layout(int screenW, int screenH) {
        PimpinConfig c = PimpinConfig.get();
        int[] b=HudLayout.bounds(4,screenW,screenH,c.minimapSize,c.minimapSize+(c.minimapCoords?16:0));
        float scale=HudLayout.effectiveScale(HudLayout.current()[4],screenW,screenH,c.minimapSize,c.minimapSize+(c.minimapCoords?16:0));
        return new int[]{b[0],b[1],Math.max(1,Math.round(c.minimapSize*scale))};
    }

    public static void render(Draw g, Minecraft mc) {
        PimpinConfig c = PimpinConfig.get();
        if (mc.player == null) return;
        Font font = mc.font;
        BlockPos death = DeathTracker.here(mc);
        if (bigMapOpen(mc)) {
            renderBig(g, mc, c, death);
            return;
        }
        if (!c.minimap) return;
        int[] l = layout(g.width(), g.height());
        float scale=HudLayout.effectiveScale(HudLayout.current()[4],g.width(),g.height(),c.minimapSize,c.minimapSize+(c.minimapCoords?16:0));
        g.push();g.scale(scale);
        int x=Math.round(l[0]/scale), y=Math.round(l[1]/scale), size=c.minimapSize;
        DynTex tex = SMALL.frame(mc, smallRes(c), ZOOMS[c.mapZoom], c.minimapRound, c.minimapRotate, c.minimapShading,
                c.minimapPlayers, c.minimapMobs, death, Waypoints.visible(mc), c.accent);
        tex.draw(g, x, y, size, size);
        if(c.minimapCompass) labels(g, mc, SMALL, x, y, size, c.minimapRotate);
        if (c.minimapCoords) {
            BlockPos p = mc.player.blockPosition();
            String s = p.getX() + ", " + p.getY() + ", " + p.getZ();
            g.fill(x,y+size,x+size,y+size+14,HudLayout.background());
            s=font.plainSubstrByWidth(s,Math.max(1,size-4));
            g.centered(font, s, x + size / 2, y + size + 3, 0xFFE0E0E0);
        }
        if (!c.minimapRound && size>=80) {
            int ruler=24;
            String range=Math.round(smallRes(c)/ZOOMS[c.mapZoom]*(ruler/(float)size))+"m";
            g.fill(x+5,y+size-19,x+ruler+9,y+size-4,0xB0101018);
            g.fill(x+7,y+size-6,x+7+ruler,y+size-5,0xFFE0E0E0);
            g.text(font,range,x+7,y+size-17,0xFFE0E0E0);
        }
        if (toast != null && System.currentTimeMillis() < toastUntil) {
            g.centered(font, toast, x + size / 2, y + size / 2 - 4, 0xFFFFFFFF);
        }
        g.pop();
    }

    private static void labels(Draw g, Minecraft mc, MapView view, int x, int y, int size, boolean rotate) {
        Font font = mc.font;
        double half = size / 2.0;
        double inset = half - 7;
        String[] names = {"N", "E", "S", "W"};
        double[][] dirs = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}};
        for (int i = 0; i < 4; i++) {

            double[] d = view.screenDir(mc, rotate, dirs[i][0], dirs[i][1]);
            int lx = (int) Math.round(x + half + d[0] * inset);
            int ly = (int) Math.round(y + half + d[1] * inset) - 4;
            g.fill(lx-4,ly-1,lx+5,ly+9,0xC0101018);
            g.centered(font, names[i], lx, ly, i == 0 ? 0xFFFF6B6B : 0xFFD8D8D8);
        }
    }

    private static void renderBig(Draw g, Minecraft mc, PimpinConfig c, BlockPos death) {
        Font font = mc.font;
        int sw = g.width();
        int sh = g.height();
        int size = Math.max(64, Math.min(sw, sh) - 70);
        int x = (sw - size) / 2;
        int y = (sh - size) / 2 + 6;
        g.fill(0, 0, sw, sh, 0x66000000);
        List<Waypoints.Point> waypoints = Waypoints.visible(mc);
        DynTex tex = BIG.frame(mc, 256, ZOOMS[bigZoom], false, false, c.minimapShading, c.minimapPlayers, c.minimapMobs, death, waypoints, c.accent);
        tex.draw(g, x, y, size, size);
        labels(g, mc, BIG, x, y, size, false);
        // Names under the diamonds; waypoints that land on top of each other share one label.
        double px = size / 256.0;
        List<int[]> placed = new java.util.ArrayList<>();
        List<Waypoints.Point> first = new java.util.ArrayList<>();
        for (Waypoints.Point w : waypoints) {
            if (!w.shown || !c.minimapWaypoints || !dev.pimpin.client.feature.WaypointPreferences.labels()) continue;
            if(c.minimapWaypointRange>0 && Math.hypot(w.x-mc.player.getX(),w.z-mc.player.getZ())>c.minimapWaypointRange) continue;
            double[] at = BIG.project(mc, ZOOMS[bigZoom], w.x + 0.5, w.z + 0.5);
            if (at == null) continue;
            int lx = x + (int) (at[0] * px);
            int ly = y + (int) (at[1] * px) + 7;
            boolean merged = false;
            for (int[] s : placed) {
                if (Math.abs(s[0] - lx) < 40 && Math.abs(s[1] - ly) < 10) {
                    s[2]++;
                    merged = true;
                    break;
                }
            }
            if (!merged) {
                placed.add(new int[]{lx, ly, 0});
                first.add(w);
            }
        }
        for (int i = 0; i < placed.size(); i++) {
            int[] s = placed.get(i);
            String label = s[2] > 0 ? first.get(i).name + " §7+" + s[2] : first.get(i).name;
            label = font.plainSubstrByWidth(label, Math.max(1, size - 8));
            int halfLabel = font.width(label) / 2;
            int lx = Math.max(x + halfLabel + 3, Math.min(x + size - halfLabel - 3, s[0]));
            int ly = Math.min(y + size - font.lineHeight - 2, s[1]);
            g.centered(font, label, lx, ly, first.get(i).color);
        }
        BlockPos p = mc.player.blockPosition();
        g.centered(font, "§lMap§r  " + p.getX() + ", " + p.getY() + ", " + p.getZ() + "  §7(" + ZOOM_NAMES[bigZoom] + ", scroll to zoom)", sw / 2, y - 14, 0xFFFFFFFF);
        if (death != null) {
            int dist = (int) Math.sqrt(death.distSqr(p));
            g.centered(font, "§cX§7 last death, " + dist + " blocks away", sw / 2, y + size + 5, 0xFFFFFFFF);
        }
    }

    public static void clearCache() {
        MapTiles.clear();
    }
}
