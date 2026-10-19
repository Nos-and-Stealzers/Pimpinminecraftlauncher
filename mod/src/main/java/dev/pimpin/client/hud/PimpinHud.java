package dev.pimpin.client.hud;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.feature.DeathTracker;
import dev.pimpin.client.feature.FpsBooster;
import dev.pimpin.client.feature.Zoom;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.item.ItemStack;
import net.minecraft.util.math.BlockPos;

import java.time.LocalTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/** Info panel, keystrokes with CPS and an armour bar — all drawn in one pass. */
public final class PimpinHud {
    private static final ArrayDeque<Long> leftClicks = new ArrayDeque<>();
    private static final ArrayDeque<Long> rightClicks = new ArrayDeque<>();
    private static double speed;
    private static double lastX = Double.NaN;
    private static double lastZ;
    private static final List<String> lines = new ArrayList<>();
    private static int lineTick;

    private PimpinHud() {}

    /** Mouse buttons are counted as they happen, so fast clicks are never missed. */
    public static void click(int button) {
        long now = System.currentTimeMillis();
        if (button == 0) leftClicks.addLast(now);
        if (button == 1) rightClicks.addLast(now);
    }

    private static int cps(ArrayDeque<Long> q) {
        long cutoff = System.currentTimeMillis() - 1000;
        while (!q.isEmpty() && q.peekFirst() < cutoff) q.pollFirst();
        return q.size();
    }

    public static void tick(MinecraftClient client) {
        ClientPlayerEntity p = client.player;
        if (p == null) return;
        if (!Double.isNaN(lastX)) {
            double d = Math.hypot(p.getX() - lastX, p.getZ() - lastZ) * 20.0;
            speed = speed * 0.7 + d * 0.3;
        }
        lastX = p.getX();
        lastZ = p.getZ();
        // Text lines change slowly: rebuild them 4× a second instead of every frame.
        if (++lineTick >= 5) {
            lineTick = 0;
            buildLines(client, p);
        }
    }

    private static void buildLines(MinecraftClient client, ClientPlayerEntity p) {
        PimpinConfig c = PimpinConfig.get();
        lines.clear();
        if (c.showFps) lines.add("§d" + client.getCurrentFps() + " FPS" + (FpsBooster.isBoosted() ? " §a⚡" : ""));
        BlockPos b = p.getBlockPos();
        if (c.showCoords) lines.add("§7XYZ §f" + b.getX() + " " + b.getY() + " " + b.getZ());
        if (c.showDirection) {
            String facing = p.getHorizontalFacing().asString();
            lines.add("§7Facing §f" + Character.toUpperCase(facing.charAt(0)) + facing.substring(1) + " §8(" + Math.round(((p.getYaw() % 360) + 360) % 360) + "°)");
        }
        if (c.showBiome && client.world != null) {
            String biome = client.world.getBiome(b).getKey().map(k -> k.getValue().getPath()).orElse("unknown").replace('_', ' ');
            lines.add("§7Biome §f" + Character.toUpperCase(biome.charAt(0)) + biome.substring(1));
        }
        if (c.showPing && !client.isInSingleplayer() && client.getNetworkHandler() != null) {
            PlayerListEntry e = client.getNetworkHandler().getPlayerListEntry(p.getUuid());
            if (e != null) lines.add("§7Ping §f" + e.getLatency() + " ms");
        }
        if (c.showSpeed) lines.add(String.format("§7Speed §f%.1f b/s", speed));
        if (c.showClock) {
            LocalTime t = LocalTime.now();
            lines.add(String.format("§7Time §f%02d:%02d", t.getHour(), t.getMinute()));
        }
        BlockPos death = c.showDeath ? DeathTracker.here(client) : null;
        if (death != null) {
            int dist = (int) Math.sqrt(death.getSquaredDistance(p.getPos()));
            lines.add("§cDeath §f" + death.getX() + " " + death.getY() + " " + death.getZ() + " §8(" + dist + "m)");
        }
        if (Zoom.isZooming()) lines.add("§bZoom " + String.format("%.1fx", Zoom.fovDivisor()));
    }

    public static void render(DrawContext ctx, RenderTickCounter tickCounter) {
        MinecraftClient client = MinecraftClient.getInstance();
        PimpinConfig c = PimpinConfig.get();
        if (client.player == null || client.options.hudHidden || client.getDebugHud().shouldShowDebugHud()) return;
        TextRenderer tr = client.textRenderer;
        int sw = ctx.getScaledWindowWidth();
        int sh = ctx.getScaledWindowHeight();

        if (c.minimap) {
            int size = c.minimapSize;
            boolean right = c.hudCorner != 1;
            Minimap.render(ctx, client, right ? sw - size - 6 : 6, 6, size, c.accent);
        }
        if (!c.hud) return;

        float s = c.hudScale;
        ctx.getMatrices().push();
        ctx.getMatrices().scale(s, s, 1f);
        int w = (int) (sw / s);
        int h = (int) (sh / s);
        int lineH = tr.fontHeight + 2;
        int panelW = 0;
        for (String l : lines) panelW = Math.max(panelW, tr.getWidth(l));
        panelW += 10;
        int keysH = c.keystrokes ? 74 : 0;
        int panelH = lines.isEmpty() ? 0 : lines.size() * lineH + 6;
        int blockW = Math.max(panelW, c.keystrokes ? 70 : 0);
        boolean right = c.hudCorner == 1 || c.hudCorner == 3;
        boolean bottom = c.hudCorner >= 2;
        int x = right ? w - blockW - 4 : 4;
        int y = bottom ? h - panelH - keysH - 46 : 4;

        if (!lines.isEmpty()) {
            if (c.hudBackground) {
                ctx.fill(x, y, x + panelW, y + panelH, 0x88000000);
                ctx.fill(x, y, x + 2, y + panelH, c.accent);
            }
            int ty = y + 4;
            for (String l : lines) {
                ctx.drawTextWithShadow(tr, l, x + 6, ty, 0xFFFFFFFF);
                ty += lineH;
            }
        }
        if (c.keystrokes) drawKeys(ctx, client, tr, x, y + panelH + 4, c.accent);
        ctx.getMatrices().pop();

        if (c.armorHud) drawArmor(ctx, client, tr, sw, sh);
    }

    private static void drawKeys(DrawContext ctx, MinecraftClient client, TextRenderer tr, int x, int y, int accent) {
        var o = client.options;
        int k = 22;
        int g = 2;
        key(ctx, tr, o.forwardKey, "W", x + k + g, y, k, k, accent);
        key(ctx, tr, o.leftKey, "A", x, y + k + g, k, k, accent);
        key(ctx, tr, o.backKey, "S", x + k + g, y + k + g, k, k, accent);
        key(ctx, tr, o.rightKey, "D", x + 2 * (k + g), y + k + g, k, k, accent);
        int by = y + 2 * (k + g);
        int half = (3 * k + 2 * g - g) / 2;
        key(ctx, tr, o.attackKey, "LMB " + cps(leftClicks), x, by, half, 14, accent);
        key(ctx, tr, o.useKey, "RMB " + cps(rightClicks), x + half + g, by, half, 14, accent);
        key(ctx, tr, o.jumpKey, "——", x, by + 14 + g, 3 * k + 2 * g, 10, accent);
    }

    private static void key(DrawContext ctx, TextRenderer tr, KeyBinding bind, String label, int x, int y, int w, int h, int accent) {
        boolean down = bind.isPressed();
        ctx.fill(x, y, x + w, y + h, down ? (accent & 0x00FFFFFF) | 0xD0000000 : 0x88000000);
        int color = down ? 0xFF000000 : 0xFFFFFFFF;
        ctx.drawText(tr, label, x + (w - tr.getWidth(label)) / 2, y + (h - 8) / 2 + 1, color, !down);
    }

    private static void drawArmor(DrawContext ctx, MinecraftClient client, TextRenderer tr, int sw, int sh) {
        ClientPlayerEntity p = client.player;
        int x = sw - 60;
        int y = sh - 22;
        List<ItemStack> items = new ArrayList<>();
        items.add(p.getMainHandStack());
        items.addAll(p.getInventory().armor);
        for (ItemStack stack : items) {
            if (stack.isEmpty()) continue;
            ctx.drawItem(stack, x, y);
            ctx.drawStackOverlay(tr, stack, x, y);
            if (stack.isDamageable()) {
                int left = stack.getMaxDamage() - stack.getDamage();
                float frac = left / (float) stack.getMaxDamage();
                int color = frac > 0.5f ? 0xFF55FF55 : frac > 0.2f ? 0xFFFFFF55 : 0xFFFF5555;
                ctx.drawTextWithShadow(tr, String.valueOf(left), x + 18, y + 5, color);
            }
            y -= 18;
        }
    }
}
