package dev.pimpin.client.hud;

import dev.pimpin.client.compat.Compat;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.BiomeColors;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.material.MapColor;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Colour + height for every block column the player has seen, one 16×16 tile per chunk.
 * Tiles are scanned a few at a time with a per-tick time budget, nearest first, and kept
 * after the chunk unloads, so the map remembers explored areas.
 */
final class MapTiles {
    static final int UNKNOWN = 0xFF15161B;
    private static final int MAX_TILES = 6000;
    private static final long BUDGET_NANOS = 1_500_000L;

    static final class Tile {
        final int[] color = new int[256];
        final short[] height = new short[256];
        long scannedTick;
        int layer;
    }

    private static final LinkedHashMap<Long, Tile> TILES = new LinkedHashMap<>(1024, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<Long, Tile> eldest) {
            return size() > MAX_TILES;
        }
    };
    private static final BlockPos.MutableBlockPos POS = new BlockPos.MutableBlockPos();
    private static ClientLevel lastLevel;
    private static long tick;
    private static int version;
    private static int layer = Integer.MIN_VALUE;

    private MapTiles() {}

    static int layer() {
        return layer;
    }

    static int version() {
        return version;
    }

    static Tile get(int cx, int cz) {
        return TILES.get(key(cx, cz));
    }

    private static long key(int cx, int cz) {
        return ((long) cx << 32) ^ (cz & 0xFFFFFFFFL);
    }

    /** Cave layer (in 8-block steps) when the map should show the floor you're on instead of the roof. */
    static int caveLayer(Minecraft mc, boolean caves) {
        ClientLevel level = mc.level;
        if (level == null || mc.player == null) return Integer.MIN_VALUE;
        BlockPos p = mc.player.blockPosition();
        boolean underground;
        if (level.dimensionType().hasCeiling()) {
            underground = true;
        } else if (!caves) {
            underground = false;
        } else {
            LevelChunk chunk = level.getChunkSource().getChunkNow(p.getX() >> 4, p.getZ() >> 4);
            int surface = chunk == null ? p.getY() : chunk.getHeight(Heightmap.Types.WORLD_SURFACE, p.getX() & 15, p.getZ() & 15);
            underground = !level.canSeeSky(p.above()) && surface - p.getY() > 6;
        }
        return underground ? Math.floorDiv(p.getY(), 8) : Integer.MIN_VALUE;
    }

    /** Scans missing and stale tiles around the player within the time budget. */
    static void update(Minecraft mc, int radiusChunks, boolean caves) {
        ClientLevel level = mc.level;
        if (level == null || mc.player == null) return;
        if (level != lastLevel) {
            TILES.clear();
            lastLevel = level;
            version++;
        }
        tick++;
        int newLayer = caveLayer(mc, caves);
        if (newLayer != layer) {
            layer = newLayer;
            version++;
        }
        int pcx = mc.player.blockPosition().getX() >> 4;
        int pcz = mc.player.blockPosition().getZ() >> 4;
        long start = System.nanoTime();
        boolean changed = false;
        // Ring by ring outwards, so what's closest fills in first.
        for (int r = 0; r <= radiusChunks; r++) {
            for (int dx = -r; dx <= r; dx++) {
                for (int dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) != r) continue;
                    int cx = pcx + dx;
                    int cz = pcz + dz;
                    Tile t = TILES.get(key(cx, cz));
                    long maxAge = r <= 1 ? 20 : r <= 3 ? 100 : 600;
                    if (t != null && t.layer == layer && tick - t.scannedTick < maxAge) continue;
                    LevelChunk chunk = level.getChunkSource().getChunkNow(cx, cz);
                    if (chunk == null) continue;
                    if (t == null) {
                        t = new Tile();
                        TILES.put(key(cx, cz), t);
                    }
                    scan(level, chunk, t, cx, cz);
                    changed = true;
                    if (System.nanoTime() - start > BUDGET_NANOS) {
                        version++;
                        return;
                    }
                }
            }
        }
        if (changed) version++;
    }

    private static void scan(ClientLevel level, LevelChunk chunk, Tile t, int cx, int cz) {
        t.scannedTick = tick;
        t.layer = layer;
        int minY = Compat.minY(level);
        int bx = cx << 4;
        int bz = cz << 4;
        for (int lz = 0; lz < 16; lz++) {
            for (int lx = 0; lx < 16; lx++) {
                int i = lz * 16 + lx;
                int wx = bx + lx;
                int wz = bz + lz;
                int y = layer == Integer.MIN_VALUE ? surface(chunk, wx, wz, lx, lz, minY) : caveFloor(chunk, wx, wz, layer * 8 + 4, minY);
                if (y == Integer.MIN_VALUE) {
                    t.color[i] = layer == Integer.MIN_VALUE ? 0xFF000000 : 0xFF26262C;
                    t.height[i] = (short) (layer == Integer.MIN_VALUE ? minY : layer * 8 + 4);
                    continue;
                }
                t.height[i] = (short) y;
                t.color[i] = columnColor(level, chunk, wx, y, wz);
            }
        }
    }

    /** Top block that actually has a map colour (skips glass, barriers and the like). */
    private static int surface(LevelChunk chunk, int wx, int wz, int lx, int lz, int minY) {
        int y = chunk.getHeight(Heightmap.Types.WORLD_SURFACE, lx, lz);
        for (int n = 0; n < 12 && y >= minY; n++, y--) {
            BlockState s = chunk.getBlockState(POS.set(wx, y, wz));
            if (!s.isAir() && s.getMapColor(chunk, POS) != MapColor.NONE) return y;
        }
        return y >= minY ? y : Integer.MIN_VALUE;
    }

    /** Underground: the first floor below an open space, starting just above your feet. */
    private static int caveFloor(LevelChunk chunk, int wx, int wz, int fromY, int minY) {
        boolean airAbove = false;
        for (int y = fromY + 2; y > fromY - 40 && y >= minY; y--) {
            BlockState s = chunk.getBlockState(POS.set(wx, y, wz));
            boolean open = s.isAir() || s.getMapColor(chunk, POS) == MapColor.NONE;
            if (!open && airAbove) return y;
            airAbove = open;
        }
        return Integer.MIN_VALUE;
    }

    private static int columnColor(ClientLevel level, LevelChunk chunk, int wx, int y, int wz) {
        BlockState state = chunk.getBlockState(POS.set(wx, y, wz));
        if (state.getFluidState().is(FluidTags.WATER)) {
            int depth = 0;
            BlockState below = state;
            while (depth < 16 && below.getFluidState().is(FluidTags.WATER)) {
                depth++;
                below = chunk.getBlockState(POS.set(wx, y - depth, wz));
            }
            int water = BiomeColors.getAverageWaterColor(level, POS.set(wx, y, wz)) & 0xFFFFFF;
            int floor = below.isAir() ? water : baseColor(level, below, wx, y - depth, wz);
            float t = Math.min(1f, 0.42f + depth * 0.07f);
            return mix(floor, darken(water, 0.92f), t);
        }
        return baseColor(level, state, wx, y, wz);
    }

    private static int baseColor(ClientLevel level, BlockState state, int wx, int y, int wz) {
        MapColor mc = state.getMapColor(level, POS.set(wx, y, wz));
        if (mc == MapColor.NONE) return 0xFF000000;
        int rgb = mc.col;
        if (mc == MapColor.GRASS) rgb = darken(BiomeColors.getAverageGrassColor(level, POS), 0.86f);
        else if (mc == MapColor.PLANT) rgb = darken(BiomeColors.getAverageFoliageColor(level, POS), 0.84f);
        else if (mc == MapColor.WATER) rgb = BiomeColors.getAverageWaterColor(level, POS);
        return 0xFF000000 | rgb;
    }

    static int mix(int a, int b, float t) {
        int r = (int) (((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t);
        int g = (int) (((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t);
        int bl = (int) ((a & 255) + ((b & 255) - (a & 255)) * t);
        return 0xFF000000 | (r << 16) | (g << 8) | bl;
    }

    static int darken(int c, float f) {
        int r = Math.min(255, (int) (((c >> 16) & 255) * f));
        int g = Math.min(255, (int) (((c >> 8) & 255) * f));
        int b = Math.min(255, (int) ((c & 255) * f));
        return (c & 0xFF000000) | (r << 16) | (g << 8) | b;
    }

    static void clear() {
        TILES.clear();
        version++;
    }
}
