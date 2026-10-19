package dev.pimpin.client.screen;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.feature.DeathTracker;
import dev.pimpin.client.feature.FpsBooster;
import dev.pimpin.client.hud.Minimap;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.option.KeybindsScreen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Pimpin Client settings, in four tabs of on/off and cycling buttons. */
public final class PimpinSettingsScreen extends Screen {
    private static final String[] TABS = {"HUD", "Minimap", "Zoom & FPS", "General"};
    private static final String[] CORNERS = {"Top left", "Top right", "Bottom left", "Bottom right"};
    private static final int[] ACCENTS = {0xFFB56CFF, 0xFFFF4FB8, 0xFF55FF55, 0xFF55FFFF, 0xFFFFAA00, 0xFFFF5555, 0xFFFFFFFF};
    private static final String[] ACCENT_NAMES = {"Violet", "Pink", "Green", "Aqua", "Gold", "Red", "White"};
    private static int tab;

    private final Screen parent;
    private final List<ButtonWidget> options = new ArrayList<>();

    public PimpinSettingsScreen(Screen parent) {
        super(Text.literal("Pimpin Client settings"));
        this.parent = parent;
    }

    private interface Row {
        Text label();
        void press();
    }

    private static Row toggle(String name, Supplier<Boolean> get, Consumer<Boolean> set) {
        return new Row() {
            public Text label() {
                return Text.literal(name + ": " + (get.get() ? "§aON" : "§cOFF"));
            }
            public void press() {
                set.accept(!get.get());
            }
        };
    }

    private static Row cycle(String name, Supplier<String> value, Runnable next) {
        return new Row() {
            public Text label() {
                return Text.literal(name + ": §e" + value.get());
            }
            public void press() {
                next.run();
            }
        };
    }

    private static <T> int next(T[] values, T current) {
        for (int i = 0; i < values.length; i++) if (values[i].equals(current)) return (i + 1) % values.length;
        return 0;
    }

    private List<Row> rows() {
        PimpinConfig c = PimpinConfig.get();
        List<Row> r = new ArrayList<>();
        switch (tab) {
            case 0 -> {
                r.add(toggle("HUD", () -> c.hud, v -> c.hud = v));
                r.add(toggle("FPS", () -> c.showFps, v -> c.showFps = v));
                r.add(toggle("Coordinates", () -> c.showCoords, v -> c.showCoords = v));
                r.add(toggle("Direction", () -> c.showDirection, v -> c.showDirection = v));
                r.add(toggle("Biome", () -> c.showBiome, v -> c.showBiome = v));
                r.add(toggle("Ping", () -> c.showPing, v -> c.showPing = v));
                r.add(toggle("Speed", () -> c.showSpeed, v -> c.showSpeed = v));
                r.add(toggle("Clock", () -> c.showClock, v -> c.showClock = v));
                r.add(toggle("Last death", () -> c.showDeath, v -> c.showDeath = v));
                r.add(toggle("Keystrokes + CPS", () -> c.keystrokes, v -> c.keystrokes = v));
                r.add(toggle("Armour & durability", () -> c.armorHud, v -> c.armorHud = v));
                r.add(toggle("Panel background", () -> c.hudBackground, v -> c.hudBackground = v));
                r.add(cycle("Position", () -> CORNERS[c.hudCorner], () -> c.hudCorner = (c.hudCorner + 1) % 4));
                r.add(cycle("Size", () -> Math.round(c.hudScale * 100) + "%", () -> c.hudScale = c.hudScale >= 1.5f ? 0.5f : c.hudScale + 0.25f));
                r.add(cycle("Colour", () -> ACCENT_NAMES[indexOf(ACCENTS, c.accent)], () -> c.accent = ACCENTS[(indexOf(ACCENTS, c.accent) + 1) % ACCENTS.length]));
            }
            case 1 -> {
                r.add(toggle("Minimap", () -> c.minimap, v -> c.minimap = v));
                r.add(cycle("Size", () -> c.minimapSize + " px", () -> c.minimapSize = c.minimapSize >= 160 ? 64 : c.minimapSize + 32));
                r.add(cycle("Zoom", () -> c.minimapZoom == 1 ? "Close" : c.minimapZoom == 2 ? "Medium" : "Far", () -> {
                    c.minimapZoom = c.minimapZoom >= 4 ? 1 : c.minimapZoom * 2;
                    Minimap.markDirty();
                }));
                r.add(toggle("Coordinates under map", () -> c.minimapCoords, v -> c.minimapCoords = v));
                r.add(toggle("Other players", () -> c.minimapPlayers, v -> c.minimapPlayers = v));
                r.add(cycle("Death marker", () -> "Clear", DeathTracker::clear));
            }
            case 2 -> {
                Float[] zooms = {2f, 3f, 4f, 6f, 8f, 12f};
                r.add(cycle("Zoom strength", () -> Math.round(c.zoomFactor) + "x", () -> c.zoomFactor = zooms[next(zooms, c.zoomFactor)]));
                r.add(toggle("Smooth zoom", () -> c.smoothZoom, v -> c.smoothZoom = v));
                r.add(toggle("Scroll to zoom", () -> c.scrollZoom, v -> c.scrollZoom = v));
                r.add(toggle("FPS boost (fast settings)", FpsBooster::isBoosted, v -> FpsBooster.toggle(client)));
                r.add(toggle("Save power in background", () -> c.backgroundFps, v -> c.backgroundFps = v));
                Integer[] limits = {5, 10, 15, 30, 60};
                r.add(cycle("Background FPS", () -> String.valueOf(c.backgroundFpsLimit), () -> c.backgroundFpsLimit = limits[next(limits, c.backgroundFpsLimit)]));
            }
            default -> {
                r.add(toggle("Pimpin button on menus", () -> c.menuButtons, v -> c.menuButtons = v));
                r.add(cycle("Controls", () -> "Open", () -> client.setScreen(new KeybindsScreen(this, client.options))));
                r.add(cycle("Mod menu", () -> "Open", () -> client.setScreen(new ModMenuScreen(this))));
                r.add(cycle("Reset all settings", () -> "Click", () -> {
                    boolean boosted = c.boostActive;
                    if (boosted) FpsBooster.disable(client);
                    PimpinConfig fresh = new PimpinConfig();
                    copyInto(fresh, c);
                }));
            }
        }
        return r;
    }

    private static void copyInto(PimpinConfig from, PimpinConfig to) {
        for (var f : PimpinConfig.class.getFields()) {
            if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
            try {
                f.set(to, f.get(from));
            } catch (IllegalAccessException ignored) {
                // public fields only
            }
        }
    }

    private static int indexOf(int[] arr, int v) {
        for (int i = 0; i < arr.length; i++) if (arr[i] == v) return i;
        return 0;
    }

    @Override
    protected void init() {
        options.clear();
        int tw = Math.min(90, (width - 40) / TABS.length);
        int tx = (width - tw * TABS.length - 4 * (TABS.length - 1)) / 2;
        for (int i = 0; i < TABS.length; i++) {
            int t = i;
            ButtonWidget b = ButtonWidget.builder(Text.literal(i == tab ? "§n" + TABS[i] : TABS[i]), x -> {
                tab = t;
                clearAndInit();
            }).dimensions(tx + i * (tw + 4), 26, tw, 20).build();
            b.active = i != tab;
            addDrawableChild(b);
        }
        List<Row> rows = rows();
        int colW = Math.min(170, (width - 50) / 2);
        int left = width / 2 - colW - 5;
        int y0 = 56;
        for (int i = 0; i < rows.size(); i++) {
            Row row = rows.get(i);
            int x = i % 2 == 0 ? left : left + colW + 10;
            int y = y0 + (i / 2) * 24;
            ButtonWidget b = ButtonWidget.builder(row.label(), btn -> {
                row.press();
                PimpinConfig.save();
                refreshLabels(rows);
            }).dimensions(x, y, colW, 20).build();
            options.add(b);
            addDrawableChild(b);
        }
        addDrawableChild(ButtonWidget.builder(Text.literal("Done"), b -> close()).dimensions(width / 2 - 75, height - 28, 150, 20).build());
    }

    private void refreshLabels(List<Row> rows) {
        for (int i = 0; i < rows.size() && i < options.size(); i++) options.get(i).setMessage(rows.get(i).label());
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        super.render(ctx, mouseX, mouseY, delta);
        ctx.drawCenteredTextWithShadow(textRenderer, "§d✦ §fPimpin Client", width / 2, 10, 0xFFFFFFFF);
    }

    @Override
    public void close() {
        PimpinConfig.save();
        client.setScreen(parent);
    }
}
