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
        int size = c.minimapSize;
        boolean right = c.minimapCorner == 1 || c.minimapCorner == 3;
        boolean bottom = c.minimapCorner >= 2;
        int x = right ? screenW - size - 6 : 6;
        int y = bottom ? screenH - size - (c.minimapCoords ? 18 : 6) : 6;
        return new int[]{x, y, size};
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
        int x = l[0], y = l[1], size = l[2];
        DynTex tex = SMALL.frame(mc, smallRes(c), ZOOMS[c.mapZoom], c.minimapRound, c.minimapRotate, c.minimapShading,
                c.minimapPlayers, c.minimapMobs, death, Waypoints.here(mc), c.accent);
        tex.draw(g, x, y, size, size);
        labels(g, mc, SMALL, x, y, size, c.minimapRotate);
        if (c.minimapCoords) {
            BlockPos p = mc.player.blockPosition();
            String s = p.getX() + ", " + p.getY() + ", " + p.getZ();
            g.centered(font, s, x + size / 2, y + size + 4, 0xFFE0E0E0);
        }
        if (toast != null && System.currentTimeMillis() < toastUntil) {
            g.centered(font, toast, x + size / 2, y + size / 2 - 4, 0xFFFFFFFF);
        }
    }

    private static void labels(Draw g, Minecraft mc, MapView view, int x, int y, int size, boolean rotate) {
        Font font = mc.font;
        double half = size / 2.0;
        double inset = half - 7;
        String[] names = {"N", "E", "S", "W"};
        double[][] dirs = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}};
        for (int i = 0; i < 4; i++) {
            if (!rotate && i != 0) continue;
            double[] d = view.screenDir(mc, rotate, dirs[i][0], dirs[i][1]);
            int lx = (int) Math.round(x + half + d[0] * inset);
            int ly = (int) Math.round(y + half + d[1] * inset) - 4;
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
        List<Waypoints.Point> waypoints = Waypoints.here(mc);
        DynTex tex = BIG.frame(mc, 256, ZOOMS[bigZoom], false, false, c.minimapShading, c.minimapPlayers, c.minimapMobs, death, waypoints, c.accent);
        tex.draw(g, x, y, size, size);
        labels(g, mc, BIG, x, y, size, false);
        // Names under the diamonds; waypoints that land on top of each other share one label.
        double px = size / 256.0;
        List<int[]> placed = new java.util.ArrayList<>();
        List<Waypoints.Point> first = new java.util.ArrayList<>();
        for (Waypoints.Point w : waypoints) {
            if (!w.shown) continue;
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
            g.centered(font, label, s[0], s[1], first.get(i).color);
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
