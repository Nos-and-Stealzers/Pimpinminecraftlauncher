package dev.pimpin.client.hud;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.feature.DeathTracker;
import net.minecraft.block.BlockState;
import net.minecraft.block.MapColor;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.fluid.FluidState;
import net.minecraft.registry.tag.FluidTags;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.RotationAxis;
import net.minecraft.world.Heightmap;
import net.minecraft.world.chunk.Chunk;
import net.minecraft.world.chunk.ChunkStatus;

/**
 * North-up minimap. The 64×64 colour image is rebuilt only when you move a
 * block (or every second for changes around you) — never every frame — and
 * only from chunks that are already loaded, so it costs almost nothing.
 */
public final class Minimap {
    private static final int RES = 64;
    private static final Identifier ID = Identifier.of("pimpin", "minimap");
    private static NativeImageBackedTexture texture;
    private static int lastX = Integer.MIN_VALUE;
    private static int lastZ;
    private static int lastY;
    private static int age;
    private static boolean dirty = true;
    private static final int[] prevHeights = new int[RES];
    private static final BlockPos.Mutable POS = new BlockPos.Mutable();

    private Minimap() {}

    public static void markDirty() {
        dirty = true;
    }

    public static void tick(MinecraftClient client) {
        if (!PimpinConfig.get().minimap || client.player == null || client.world == null) return;
        BlockPos p = client.player.getBlockPos();
        int zoom = PimpinConfig.get().minimapZoom;
        boolean moved = Math.abs(p.getX() - lastX) >= zoom || Math.abs(p.getZ() - lastZ) >= zoom || Math.abs(p.getY() - lastY) > 3;
        if (moved || dirty || ++age >= 20) {
            rebuild(client.world, p, zoom);
            lastX = p.getX();
            lastZ = p.getZ();
            lastY = p.getY();
            age = 0;
            dirty = false;
        }
    }

    private static void ensureTexture(MinecraftClient client) {
        if (texture != null) return;
        texture = new NativeImageBackedTexture(RES, RES, true);
        client.getTextureManager().registerTexture(ID, texture);
    }

    private static void rebuild(ClientWorld world, BlockPos center, int zoom) {
        MinecraftClient client = MinecraftClient.getInstance();
        ensureTexture(client);
        NativeImage img = texture.getImage();
        if (img == null) return;
        boolean ceiling = world.getDimension().hasCeiling();
        int half = RES / 2;
        for (int px = 0; px < RES; px++) prevHeights[px] = Integer.MIN_VALUE;
        for (int pz = 0; pz < RES; pz++) {
            Chunk chunk = null;
            int chunkX = Integer.MIN_VALUE;
            int wz = center.getZ() + (pz - half) * zoom;
            for (int px = 0; px < RES; px++) {
                int wx = center.getX() + (px - half) * zoom;
                if ((wx >> 4) != chunkX) {
                    chunkX = wx >> 4;
                    chunk = world.getChunk(chunkX, wz >> 4, ChunkStatus.FULL, false);
                }
                if (chunk == null) {
                    img.setColorArgb(px, pz, 0xFF101014);
                    prevHeights[px] = Integer.MIN_VALUE;
                    continue;
                }
                int y = ceiling ? caveTop(chunk, wx, wz, center.getY()) : chunk.sampleHeightmap(Heightmap.Type.WORLD_SURFACE, wx & 15, wz & 15) - 1;
                if (y < world.getBottomY()) {
                    img.setColorArgb(px, pz, 0xFF101014);
                    continue;
                }
                BlockState state = chunk.getBlockState(POS.set(wx, y, wz));
                int color;
                FluidState fluid = state.getFluidState();
                if (fluid.isIn(FluidTags.WATER)) {
                    int depth = 0;
                    while (depth < 12 && chunk.getBlockState(POS.set(wx, y - depth - 1, wz)).getFluidState().isIn(FluidTags.WATER)) depth++;
                    MapColor.Brightness b = depth > 7 ? MapColor.Brightness.LOW : depth > 2 ? MapColor.Brightness.NORMAL : MapColor.Brightness.HIGH;
                    color = MapColor.WATER_BLUE.getRenderColor(b);
                } else {
                    MapColor mc = state.getMapColor(world, POS);
                    int prev = prevHeights[px];
                    MapColor.Brightness b = prev == Integer.MIN_VALUE || prev == y ? MapColor.Brightness.NORMAL : y > prev ? MapColor.Brightness.HIGH : MapColor.Brightness.LOW;
                    color = mc == MapColor.CLEAR ? 0xFF101014 : mc.getRenderColor(b);
                }
                prevHeights[px] = y;
                img.setColorArgb(px, pz, color);
            }
        }
        texture.upload();
    }

    /** Nether / caves: the first floor below the player instead of the roof. */
    private static int caveTop(Chunk chunk, int x, int z, int fromY) {
        boolean airAbove = false;
        for (int y = fromY + 2; y > fromY - 48; y--) {
            boolean air = chunk.getBlockState(POS.set(x, y, z)).isAir();
            if (!air && airAbove) return y;
            airAbove = air;
        }
        return Integer.MIN_VALUE;
    }

    public static void render(DrawContext ctx, MinecraftClient client, int x, int y, int size, int accent) {
        if (texture == null || client.player == null) return;
        int zoom = PimpinConfig.get().minimapZoom;
        ctx.fill(x - 2, y - 2, x + size + 2, y + size + 2, 0xB0000000);
        ctx.fill(x - 1, y - 1, x + size + 1, y, accent);
        ctx.drawTexture(RenderLayer::getGuiTextured, ID, x, y, 0f, 0f, size, size, RES, RES, RES, RES);

        double scale = (double) size / (RES * zoom); // screen px per block
        ClientPlayerEntity me = client.player;
        int cx = x + size / 2;
        int cy = y + size / 2;
        if (PimpinConfig.get().minimapPlayers && client.world != null) {
            for (PlayerEntity other : client.world.getPlayers()) {
                if (other == me) continue;
                int ox = cx + (int) Math.round((other.getX() - me.getX()) * scale);
                int oy = cy + (int) Math.round((other.getZ() - me.getZ()) * scale);
                if (ox > x + 1 && oy > y + 1 && ox < x + size - 1 && oy < y + size - 1) {
                    ctx.fill(ox - 1, oy - 1, ox + 2, oy + 2, 0xFF000000);
                    ctx.fill(ox, oy, ox + 1, oy + 1, 0xFF55FFFF);
                }
            }
        }
        BlockPos death = DeathTracker.here(client);
        if (death != null) {
            int dx = cx + (int) Math.round((death.getX() + 0.5 - me.getX()) * scale);
            int dy = cy + (int) Math.round((death.getZ() + 0.5 - me.getZ()) * scale);
            dx = Math.max(x + 2, Math.min(x + size - 3, dx));
            dy = Math.max(y + 2, Math.min(y + size - 3, dy));
            ctx.fill(dx - 2, dy - 2, dx + 3, dy + 3, 0xFF000000);
            ctx.fill(dx - 1, dy - 1, dx + 2, dy + 2, 0xFFFF5555);
        }

        // Player arrow, rotated with your view.
        ctx.getMatrices().push();
        ctx.getMatrices().translate(cx + 0.5f, cy + 0.5f, 0);
        ctx.getMatrices().multiply(RotationAxis.POSITIVE_Z.rotationDegrees(me.getYaw() - 180f));
        for (int row = 0; row < 5; row++) ctx.fill(-row - 1, row - 3, row + 1, row - 2, 0xFF000000);
        for (int row = 0; row < 4; row++) ctx.fill(-row, row - 2, row, row - 1, 0xFFFFFFFF);
        ctx.fill(0, -3, 1, 2, 0xFFFFFFFF);
        ctx.getMatrices().pop();

        ctx.drawCenteredTextWithShadow(client.textRenderer, "N", cx, y + 2, 0xFFFFFFFF);
        if (PimpinConfig.get().minimapCoords) {
            BlockPos p = me.getBlockPos();
            String s = p.getX() + ", " + p.getY() + ", " + p.getZ();
            ctx.drawCenteredTextWithShadow(client.textRenderer, s, cx, y + size + 4, 0xFFE0E0E0);
        }
    }
}
