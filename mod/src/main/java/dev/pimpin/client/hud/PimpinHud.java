package dev.pimpin.client.hud;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.feature.DeathTracker;
import dev.pimpin.client.feature.FpsBooster;
import dev.pimpin.client.feature.Zoom;
import dev.pimpin.client.feature.ToggleSprint;
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
        dev.pimpin.client.screen.HudLayoutDevTest.tick(client);
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

        renderModules(g, client, false);
        dev.pimpin.client.feature.WaypointNavigation.render(g, client);
    }

    public static List<String> information(Minecraft client, boolean preview) {
        List<String> text = new ArrayList<>(lines);
        String sprint = ToggleSprint.indicator(client);
        if (sprint != null) text.add(sprint);
        if (preview && text.isEmpty()) text.add("144 FPS | XYZ 120 64 -80");
        return text;
    }
    public static int[] moduleSize(int id, Minecraft client, boolean preview) {
        if (id == 1) return new int[]{70,74};
        if (id == 2) return new int[]{62,90};
        if (id == 4) return new int[]{PimpinConfig.get().minimapSize, PimpinConfig.get().minimapSize + (PimpinConfig.get().minimapCoords ? 16 : 0)};
        List<String> text = id == 0 ? information(client,preview) : EffectsHud.lines(client,200,PimpinConfig.get().effectHudRows);
        if (preview && text.isEmpty()) text = List.of(id == 0 ? "144 FPS" : "Regeneration II 0:45");
        int w = 40;
        for (String line : text) w = Math.max(w, client.font.width(line));
        return new int[]{w+12, Math.max(16,text.size()*(client.font.lineHeight+2)+8)};
    }
    public static void renderModules(Draw g, Minecraft client, boolean preview) {
        PimpinConfig c=PimpinConfig.get();
        for (int id=0;id<4;id++) {
            boolean enabled = c.hud && (id==0 || id==1 && c.keystrokes || id==2 && c.armorHud || id==3 && c.effectHud);
            if (!enabled && !preview) continue;
            int[] size=moduleSize(id,client,preview);
            int[] b=HudLayout.bounds(id,g.width(),g.height(),size[0],size[1]);
            float scale=HudLayout.effectiveScale(HudLayout.current()[id],g.width(),g.height(),size[0],size[1]);
            int x=Math.round(b[0]/scale), y=Math.round(b[1]/scale);
            g.push(); g.scale(scale);
            if (id==1) drawKeys(g,client,client.font,x,y,c.accent);
            else if (id==2) {
                if (preview) {
                    g.fill(x,y,x+size[0],y+size[1],HudLayout.background());
                    g.text(client.font,"Armor",x+5,y+5,0xFFFFFFFF);
                    for(int i=0;i<4;i++) g.text(client.font,"100%",x+18,y+20+i*16,0xFF88EE88);
                } else drawArmor(g,client,client.font,x,y);
            } else {
                List<String> text = id==0 ? information(client,preview) : EffectsHud.lines(client,200,c.effectHudRows);
                if(preview && text.isEmpty()) text=List.of(id==0 ? "144 FPS" : "Regeneration II 0:45");
                if(!text.isEmpty()) {
                    if(c.hudBackground) {
                        g.fill(x,y,x+size[0],y+size[1],HudLayout.background());
                        g.fill(x,y,x+2,y+size[1],c.accent);
                    }
                    int ty=y+4;
                    for(String line:text) {g.text(client.font,line,x+6,ty,enabled ? 0xFFFFFFFF : 0xFF999999);ty+=client.font.lineHeight+2;}
                }
            }
            g.pop();
        }
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
        g.fill(x, y, x + w, y + h, down ? (accent & 0x00FFFFFF) | 0xD0000000 : HudLayout.background());
        int color = down ? 0xFF000000 : 0xFFFFFFFF;
        g.text(font, label, x + (w - font.width(label)) / 2, y + (h - 8) / 2 + 1, color, !down);
    }

    private static void drawArmor(Draw g, Minecraft client, Font font, int x, int top) {
        LocalPlayer p = client.player;
        int y = top + 72;
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
