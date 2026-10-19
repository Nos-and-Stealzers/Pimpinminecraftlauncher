package dev.pimpin.client.hud;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.feature.DeathTracker;
import dev.pimpin.client.feature.FpsBooster;
import dev.pimpin.client.feature.Zoom;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import dev.pimpin.client.compat.Draw;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

import java.time.LocalTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/** Info panel, keystrokes with CPS and an armour bar, all drawn in one pass. */
public final class PimpinHud {
    private static final ArrayDeque<Long> leftClicks = new ArrayDeque<>();
    private static final ArrayDeque<Long> rightClicks = new ArrayDeque<>();
    private static final EquipmentSlot[] ARMOR = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
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

    public static void tick(Minecraft client) {
        LocalPlayer p = client.player;
        if (p == null) return;
        if (!Double.isNaN(lastX)) {
            double d = Math.hypot(p.getX() - lastX, p.getZ() - lastZ) * 20.0;
            speed = speed * 0.7 + d * 0.3;
        }
        lastX = p.getX();
        lastZ = p.getZ();
        // Text lines change slowly: rebuild them 4 times a second instead of every frame.
        if (++lineTick >= 5) {
            lineTick = 0;
            buildLines(client, p);
        }
    }

    private static void buildLines(Minecraft client, LocalPlayer p) {
        PimpinConfig c = PimpinConfig.get();
        lines.clear();
        if (c.showFps) lines.add("§d" + client.getFps() + " FPS" + (FpsBooster.isBoosted() ? " §a⚡" : ""));
        BlockPos b = p.blockPosition();
        if (c.showCoords) lines.add("§7XYZ §f" + b.getX() + " " + b.getY() + " " + b.getZ());
        if (c.showDirection) {
            String facing = p.getDirection().getName();
            int deg = Math.round(((p.getYRot() % 360) + 360) % 360);
            lines.add("§7Facing §f" + Character.toUpperCase(facing.charAt(0)) + facing.substring(1) + " §8(" + deg + "°)");
        }
        if (c.showBiome && client.level != null) {
            lines.add("§7Biome §f" + Compat.prettyKey(client.level.getBiome(b).unwrapKey().orElse(null)));
        }
        if (c.showPing && !client.hasSingleplayerServer() && client.getConnection() != null) {
            PlayerInfo e = client.getConnection().getPlayerInfo(p.getUUID());
            if (e != null) lines.add("§7Ping §f" + e.getLatency() + " ms");
        }
        if (c.showSpeed) lines.add(String.format("§7Speed §f%.1f b/s", speed));
        if (c.showClock) {
            LocalTime t = LocalTime.now();
            lines.add(String.format("§7Time §f%02d:%02d", t.getHour(), t.getMinute()));
        }
        BlockPos death = c.showDeath ? DeathTracker.here(client) : null;
        if (death != null) {
            int dist = (int) Math.sqrt(death.distSqr(b));
            lines.add("§cDeath §f" + death.getX() + " " + death.getY() + " " + death.getZ() + " §8(" + dist + "m)");
        }
        if (Zoom.isZooming()) lines.add("§bZoom " + String.format("%.1fx", Zoom.fovDivisor()));
    }

    public static void render(Draw g) {
        Minecraft client = Minecraft.getInstance();
        PimpinConfig c = PimpinConfig.get();
        if (client.player == null || Compat.hudHidden(client) || Compat.debugScreenOpen(client)) return;
        Font font = client.font;
        int sw = g.width();
        int sh = g.height();

        Minimap.render(g, client);
        if (Minimap.bigMapOpen(client) || !c.hud) return;

        float s = c.hudScale;
        int w = (int) (sw / s);
        int h = (int) (sh / s);
        int lineH = font.lineHeight + 2;
        int panelW = 0;
        for (String l : lines) panelW = Math.max(panelW, font.width(l));
        panelW += 10;
        int keysH = c.keystrokes ? 74 : 0;
        int panelH = lines.isEmpty() ? 0 : lines.size() * lineH + 6;
        int blockW = Math.max(panelW, c.keystrokes ? 70 : 0);
        boolean right = c.hudCorner == 1 || c.hudCorner == 3;
        boolean bottom = c.hudCorner >= 2;
        int x = right ? w - blockW - 4 : 4;
        int y = bottom ? h - panelH - keysH - 46 : 4;
        // Same corner as the minimap: stack under it (or above it at the bottom).
        if (c.minimap && c.minimapCorner == c.hudCorner) {
            int[] m = Minimap.layout(sw, sh);
            int mapTop = (int) ((m[1] - 6) / s);
            int mapBottom = (int) ((m[1] + m[2] + (c.minimapCoords ? 16 : 6)) / s);
            if (bottom) y = Math.min(y, mapTop - panelH - keysH - 4);
            else y = Math.max(y, mapBottom);
        }

        g.push();
        g.scale(s);
        if (!lines.isEmpty()) {
            if (c.hudBackground) {
                g.fill(x, y, x + panelW, y + panelH, 0x88000000);
                g.fill(x, y, x + 2, y + panelH, c.accent);
            }
            int ty = y + 4;
            for (String l : lines) {
                g.text(font, l, x + 6, ty, 0xFFFFFFFF);
                ty += lineH;
            }
        }
        if (c.keystrokes) drawKeys(g, client, font, x, y + panelH + 4, c.accent);
        g.pop();

        if (c.armorHud) drawArmor(g, client, font, sw, sh);
    }

    private static void drawKeys(Draw g, Minecraft client, Font font, int x, int y, int accent) {
        var o = client.options;
        int k = 22;
        int gap = 2;
        key(g, font, o.keyUp, "W", x + k + gap, y, k, k, accent);
        key(g, font, o.keyLeft, "A", x, y + k + gap, k, k, accent);
        key(g, font, o.keyDown, "S", x + k + gap, y + k + gap, k, k, accent);
        key(g, font, o.keyRight, "D", x + 2 * (k + gap), y + k + gap, k, k, accent);
        int by = y + 2 * (k + gap);
        int half = (3 * k + 2 * gap - gap) / 2;
        key(g, font, o.keyAttack, "LMB " + cps(leftClicks), x, by, half, 14, accent);
        key(g, font, o.keyUse, "RMB " + cps(rightClicks), x + half + gap, by, half, 14, accent);
        key(g, font, o.keyJump, "——", x, by + 14 + gap, 3 * k + 2 * gap, 10, accent);
    }

    private static void key(Draw g, Font font, KeyMapping bind, String label, int x, int y, int w, int h, int accent) {
        boolean down = bind.isDown();
        g.fill(x, y, x + w, y + h, down ? (accent & 0x00FFFFFF) | 0xD0000000 : 0x88000000);
        int color = down ? 0xFF000000 : 0xFFFFFFFF;
        g.text(font, label, x + (w - font.width(label)) / 2, y + (h - 8) / 2 + 1, color, !down);
    }

    private static void drawArmor(Draw g, Minecraft client, Font font, int sw, int sh) {
        LocalPlayer p = client.player;
        int x = sw - 60;
        int y = sh - 22;
        List<ItemStack> items = new ArrayList<>();
        items.add(p.getMainHandItem());
        for (int i = ARMOR.length - 1; i >= 0; i--) items.add(p.getItemBySlot(ARMOR[i]));
        for (ItemStack stack : items) {
            if (stack.isEmpty()) continue;
            g.item(stack, x, y);
            g.itemDecorations(font, stack, x, y);
            if (stack.isDamageableItem()) {
                int left = stack.getMaxDamage() - stack.getDamageValue();
                float frac = left / (float) stack.getMaxDamage();
                int color = frac > 0.5f ? 0xFF55FF55 : frac > 0.2f ? 0xFFFFFF55 : 0xFFFF5555;
                g.text(font, String.valueOf(left), x + 18, y + 5, color);
            }
            y -= 18;
        }
    }
}
