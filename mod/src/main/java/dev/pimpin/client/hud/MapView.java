package dev.pimpin.client.hud;

import dev.pimpin.client.compat.DynTex;
import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.feature.Waypoints;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.player.Player;

import java.util.List;

/**
 * One rendered map (the corner minimap or the big map). Two stages:
 * 1. a world-aligned raster with hill shading, rebuilt only when tiles change or you
 *    move far enough;
 * 2. a per-frame compose into an ARGB texture: rotation, round mask, smooth scrolling,
 *    markers and the player arrow are all drawn here on the CPU, so the GPU side is a
 *    single textured quad on every Minecraft version.
 */
final class MapView {
    private final String name;
    private int res;
    private DynTex tex;
    private int[] out;

    private int[] raster = new int[0];
    private int rasterW;
    private int step = 1;
    private int originX;
    private int originZ;
    private int rasterVersion = -1;
    private int rasterZoomKey = -1;
    private int rasterCenterX = Integer.MIN_VALUE;
    private int rasterCenterZ;
    private long lastCompose;

    MapView(String name) {
        this.name = name;
    }

    int resolution() {
        return res;
    }

    private void ensure(int resolution) {
        if (tex != null && res == resolution) return;
        res = resolution;
        tex = DynTex.create("map/" + name + "_" + resolution, resolution, resolution);
        out = new int[resolution * resolution];
        rasterVersion = -1;
    }

    /** Blocks visible from the centre to the edge, including the corners when rotated. */
    private double radiusBlocks(float zoom) {
        return res / 2.0 / zoom * 1.4143 + 2;
    }

    private void rebuildRaster(int cx, int cz, float zoom, boolean shading) {
        step = zoom >= 1f ? 1 : Math.round(1f / zoom);
        int radius = (int) Math.ceil(radiusBlocks(zoom));
        originX = Math.floorDiv(cx - radius, step) * step;
        originZ = Math.floorDiv(cz - radius, step) * step;
        rasterW = (2 * radius) / step + 3;
        if (raster.length != rasterW * rasterW) raster = new int[rasterW * rasterW];
        int[] heights = new int[rasterW * rasterW];
        int layer = MapTiles.layer();
        MapTiles.Tile tile = null;
        int tileCx = Integer.MIN_VALUE;
        int tileCz = Integer.MIN_VALUE;
        for (int rz = 0; rz < rasterW; rz++) {
            int wz = originZ + rz * step;
            for (int rx = 0; rx < rasterW; rx++) {
                int wx = originX + rx * step;
                int tcx = wx >> 4;
                int tcz = wz >> 4;
                if (tcx != tileCx || tcz != tileCz) {
                    tileCx = tcx;
                    tileCz = tcz;
                    tile = MapTiles.get(tcx, tcz);
                    if (tile != null && tile.layer != layer) tile = null;
                }
                int i = rz * rasterW + rx;
                if (tile == null) {
                    raster[i] = MapTiles.UNKNOWN;
                    heights[i] = Integer.MIN_VALUE;
                } else {
                    int ti = (wz & 15) * 16 + (wx & 15);
                    raster[i] = tile.color[ti];
                    heights[i] = tile.height[ti];
                }
            }
        }
        if (shading) {
            // Light from the north-west, like the in-game map: slopes facing it get brighter.
            for (int rz = rasterW - 1; rz >= 1; rz--) {
                for (int rx = rasterW - 1; rx >= 1; rx--) {
                    int i = rz * rasterW + rx;
                    int h = heights[i];
                    int n = heights[i - rasterW - 1];
                    if (h == Integer.MIN_VALUE || n == Integer.MIN_VALUE) continue;
                    int diff = Math.max(-4, Math.min(4, (h - n) / step));
                    if (diff != 0) raster[i] = MapTiles.darken(raster[i], 1f + diff * 0.055f);
                }
            }
        }
        rasterCenterX = cx;
        rasterCenterZ = cz;
    }

    /**
     * Updates and returns the texture for this frame.
     * @param zoom texels per block
     */
    DynTex frame(Minecraft mc, int resolution, float zoom, boolean round, boolean rotate, boolean shading,
                 boolean players, boolean mobs, BlockPos death, List<Waypoints.Point> waypoints, int accent) {
        ensure(resolution);
        LocalPlayer me = mc.player;
        long now = System.nanoTime();
        if (now - lastCompose < 1_000_000_000L / Math.max(1,PimpinConfig.get().minimapRefresh)) return tex; // configurable compose/upload cap
        lastCompose = now;

        int bx = me.blockPosition().getX();
        int bz = me.blockPosition().getZ();
        int zoomKey = Float.floatToIntBits(zoom) ^ (shading ? 1 : 0) ^ (res << 8);
        int moveLimit = Math.max(4, (int) (res / zoom * 0.15));
        if (rasterVersion != MapTiles.version() || zoomKey != rasterZoomKey || Math.abs(bx - rasterCenterX) > moveLimit || Math.abs(bz - rasterCenterZ) > moveLimit) {
            rebuildRaster(bx, bz, zoom, shading);
            rasterVersion = MapTiles.version();
            rasterZoomKey = zoomKey;
        }

        double yaw = Math.toRadians(rotate ? me.getYRot() : 180f);
        double fx = -Math.sin(yaw);
        double fz = Math.cos(yaw);
        double rx = -Math.cos(yaw);
        double rz = -Math.sin(yaw);
        double px = me.getX();
        double pz = me.getZ();
        double half = res / 2.0;
        double inv = 1.0 / zoom;
        double r2 = (half - 0.5) * (half - 0.5);
        double ring = (half - 2.5) * (half - 2.5);
        int border = 0xFF0C0C10;

        for (int v = 0; v < res; v++) {
            double dv = v + 0.5 - half;
            for (int u = 0; u < res; u++) {
                double du = u + 0.5 - half;
                int i = v * res + u;
                if (round) {
                    double d2 = du * du + dv * dv;
                    if (d2 > r2) {
                        out[i] = 0;
                        continue;
                    }
                    if (d2 > ring) {
                        out[i] = d2 > (half - 1.5) * (half - 1.5) ? border : accent;
                        continue;
                    }
                } else if (u == 0 || v == 0 || u == res - 1 || v == res - 1) {
                    out[i] = border;
                    continue;
                } else if (v == 1 || u == 1 || v == res-2 || u == res-2) {
                    out[i] = accent;
                    continue;
                }
                double wx = px + (rx * du - fx * dv) * inv;
                double wz = pz + (rz * du - fz * dv) * inv;
                int ix = Math.floorDiv((int) Math.floor(wx) - originX, step);
                int iz = Math.floorDiv((int) Math.floor(wz) - originZ, step);
                out[i] = ix < 0 || iz < 0 || ix >= rasterW || iz >= rasterW ? MapTiles.UNKNOWN : raster[iz * rasterW + ix];
            }
        }

        double scale = zoom;
        if ((players || mobs) && mc.level != null) {
            double maxDist = radiusBlocks(zoom);
            for (Entity e : mc.level.entitiesForRendering()) {
                if (e == me || e.isRemoved()) continue;
                boolean isPlayer = e instanceof Player;
                boolean hostile = e instanceof Enemy;
                if (isPlayer ? !players : !mobs || !(e instanceof Mob)) continue;
                PimpinConfig c = PimpinConfig.get();
                if (!isPlayer && (hostile ? !c.minimapHostiles : !c.minimapAnimals)) continue;
                if (Math.abs(e.getY()-me.getY()) > c.minimapEntityHeight) continue;
                double ox = e.getX() - px;
                double oz = e.getZ() - pz;
                if (Math.abs(ox) > maxDist || Math.abs(oz) > maxDist) continue;
                double su = half + (ox * rx + oz * rz) * scale;
                double sv = half - (ox * fx + oz * fz) * scale;
                if (isPlayer) dot(su, sv, 2, 0xFF000000, 0xFFFFFFFF, round, accent);
                else if (hostile) dot(su, sv, 1, 0xFF1A0000, 0xFFFF4040, round, 0);
                else dot(su, sv, 1, 0xFF001A00, 0xFF7CFF6B, round, 0);
            }
        }
        for (Waypoints.Point w : waypoints) {
            PimpinConfig c = PimpinConfig.get();
            if (!w.shown || !c.minimapWaypoints) continue;
            double distance = Math.hypot(w.x-px,w.z-pz);
            if (c.minimapWaypointRange > 0 && distance > c.minimapWaypointRange) continue;
            double du=((w.x+.5-px)*rx+(w.z+.5-pz)*rz)*zoom;
            double dv=((w.x+.5-px)*fx+(w.z+.5-pz)*fz)*zoom;
            double reach=round?Math.hypot(du,dv):Math.max(Math.abs(du),Math.abs(dv));
            if (!c.minimapEdgeMarkers && reach > res/2.0-5) continue;
            double[] at = clampToEdge(w.x + 0.5 - px, w.z + 0.5 - pz, fx, fz, rx, rz, scale, round);
            diamond((int) at[0], (int) at[1], w.color);
        }
        if (death != null) {
            double[] at = clampToEdge(death.getX() + 0.5 - px, death.getZ() + 0.5 - pz, fx, fz, rx, rz, scale, round);
            cross((int) at[0], (int) at[1]);
        }

        // Player arrow: points up when the map turns with you, otherwise where you look.
        double ax = rotate ? 0 : -Math.sin(Math.toRadians(me.getYRot()));
        double az = rotate ? -1 : Math.cos(Math.toRadians(me.getYRot()));
        double size = Math.max(3.5, res / 24.0);
        arrow(half, half, ax, az, size * 1.45, 0xFF000000);
        arrow(half, half, ax, az, size, 0xFFFFFFFF);

        tex.setAll(out);
        return tex;
    }

    private void put(int u, int v, int color) {
        if (u < 0 || v < 0 || u >= res || v >= res) return;
        int i = v * res + u;
        if (out[i] == 0) return; // outside a round map
        out[i] = color;
    }

    private void dot(double su, double sv, int r, int outline, int fill, boolean round, int ring) {
        int u = (int) Math.floor(su);
        int v = (int) Math.floor(sv);
        double half = res / 2.0;
        double lim = half - 3 - r;
        if (round ? (su - half) * (su - half) + (sv - half) * (sv - half) > lim * lim : u < 3 + r || v < 3 + r || u > res - 4 - r || v > res - 4 - r) return;
        for (int y = -r - 1; y <= r; y++) for (int x = -r - 1; x <= r; x++) put(u + x, v + y, outline);
        for (int y = -r; y < r; y++) for (int x = -r; x < r; x++) put(u + x, v + y, fill);
        if (ring != 0 && r >= 2) put(u, v, ring);
    }

    /** Map position of a world offset; markers off the map stick to its edge. */
    private double[] clampToEdge(double ox, double oz, double fx, double fz, double rx, double rz, double scale, boolean round) {
        double half = res / 2.0;
        double du = (ox * rx + oz * rz) * scale;
        double dv = -(ox * fx + oz * fz) * scale;
        double lim = half - 5;
        double len = round ? Math.sqrt(du * du + dv * dv) : Math.max(Math.abs(du), Math.abs(dv));
        if (len > lim) {
            du = du / len * lim;
            dv = dv / len * lim;
        }
        return new double[]{half + du, half + dv};
    }

    private void diamond(int u, int v, int color) {
        for (int y = -4; y <= 4; y++) {
            int w = 4 - Math.abs(y);
            for (int x = -w; x <= w; x++) put(u + x, v + y, 0xFF000000);
        }
        for (int y = -3; y <= 3; y++) {
            int w = 3 - Math.abs(y);
            for (int x = -w; x <= w; x++) put(u + x, v + y, color);
        }
    }

    /** Where a world position lands on the north-up big map, in texels, or null when off it. */
    double[] project(Minecraft mc, float zoom, double wx, double wz) {
        double half = res / 2.0;
        double u = half + (wx - mc.player.getX()) * zoom;
        double v = half + (wz - mc.player.getZ()) * zoom;
        return u < 0 || v < 0 || u >= res || v >= res ? null : new double[]{u, v};
    }

    private void cross(int u, int v) {
        for (int d = -3; d <= 3; d++) {
            for (int t = -1; t <= 1; t++) {
                put(u + d + t, v + d, 0xFF000000);
                put(u + d + t, v - d, 0xFF000000);
            }
        }
        for (int d = -2; d <= 2; d++) {
            put(u + d, v + d, 0xFFFF5555);
            put(u + d, v - d, 0xFFFF5555);
        }
    }

    /** Filled arrow head, rasterised from two triangles. */
    private void arrow(double cu, double cv, double dx, double dz, double len, int color) {
        double px = -dz;
        double pz = dx;
        double tipU = cu + dx * len, tipV = cv + dz * len;
        double lU = cu - dx * len * 0.7 + px * len * 0.75, lV = cv - dz * len * 0.7 + pz * len * 0.75;
        double rU = cu - dx * len * 0.7 - px * len * 0.75, rV = cv - dz * len * 0.7 - pz * len * 0.75;
        double nU = cu - dx * len * 0.25, nV = cv - dz * len * 0.25;
        int minU = (int) Math.floor(Math.min(Math.min(tipU, lU), rU));
        int maxU = (int) Math.ceil(Math.max(Math.max(tipU, lU), rU));
        int minV = (int) Math.floor(Math.min(Math.min(tipV, lV), rV));
        int maxV = (int) Math.ceil(Math.max(Math.max(tipV, lV), rV));
        for (int v = minV; v <= maxV; v++) {
            for (int u = minU; u <= maxU; u++) {
                double su = u + 0.5;
                double sv = v + 0.5;
                if (inTri(su, sv, tipU, tipV, lU, lV, nU, nV) || inTri(su, sv, tipU, tipV, nU, nV, rU, rV)) put(u, v, color);
            }
        }
    }

    private static boolean inTri(double x, double y, double ax, double ay, double bx, double by, double cx, double cy) {
        double d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
        double d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
        double d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
        boolean neg = d1 < 0 || d2 < 0 || d3 < 0;
        boolean pos = d1 > 0 || d2 > 0 || d3 > 0;
        return !(neg && pos);
    }

    /** Where a world direction (unit vector) points from the map centre, in texels. */
    double[] screenDir(Minecraft mc, boolean rotate, double wx, double wz) {
        double yaw = Math.toRadians(rotate ? mc.player.getYRot() : 180f);
        double fx = -Math.sin(yaw);
        double fz = Math.cos(yaw);
        double rx = -Math.cos(yaw);
        double rz = -Math.sin(yaw);
        return new double[]{wx * rx + wz * rz, -(wx * fx + wz * fz)};
    }
}
