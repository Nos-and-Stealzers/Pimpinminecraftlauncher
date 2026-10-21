package dev.pimpin.client.screen;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.BaseScreen;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.feature.DeathTracker;
import dev.pimpin.client.feature.FpsBooster;
import dev.pimpin.client.feature.Waypoints;
import dev.pimpin.client.hud.Minimap;
import dev.pimpin.client.compat.Draw;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Pimpin Client settings, in four tabs of on/off and cycling buttons. */
public final class PimpinSettingsScreen extends BaseScreen {
    private static final String[] TABS = {"HUD", "Minimap", "Zoom & FPS", "General"};
    private static final String[] CORNERS = {"Top left", "Top right", "Bottom left", "Bottom right"};
    private static final int[] ACCENTS = {0xFFB56CFF, 0xFFFF4FB8, 0xFF55FF55, 0xFF55FFFF, 0xFFFFAA00, 0xFFFF5555, 0xFFFFFFFF};
    private static final String[] ACCENT_NAMES = {"Violet", "Pink", "Green", "Aqua", "Gold", "Red", "White"};
    private static int tab;

    private final Screen parent;
    private final List<Button> options = new ArrayList<>();

    public PimpinSettingsScreen(Screen parent) {
        super(Component.literal("Pimpin Client settings"));
        this.parent = parent;
    }

    private interface Row {
        Component label();

        void press();
    }

    private static Row toggle(String name, Supplier<Boolean> get, Consumer<Boolean> set) {
        return new Row() {
            public Component label() {
                return Component.literal(name + ": " + (get.get() ? "§aON" : "§cOFF"));
            }

            public void press() {
                set.accept(!get.get());
            }
        };
    }

    private static Row cycle(String name, Supplier<String> value, Runnable next) {
        return new Row() {
            public Component label() {
                return Component.literal(name + ": §e" + value.get());
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
                r.add(cycle("Zoom", () -> Minimap.ZOOM_NAMES[c.mapZoom], () -> c.mapZoom = (c.mapZoom + 1) % Minimap.ZOOMS.length));
                r.add(cycle("Position", () -> CORNERS[c.minimapCorner], () -> c.minimapCorner = (c.minimapCorner + 1) % 4));
                r.add(cycle("Shape", () -> c.minimapRound ? "Round" : "Square", () -> c.minimapRound = !c.minimapRound));
                r.add(toggle("Turn with me", () -> c.minimapRotate, v -> c.minimapRotate = v));
                r.add(toggle("Hill shading", () -> c.minimapShading, v -> c.minimapShading = v));
                r.add(toggle("Cave view underground", () -> c.minimapCaves, v -> c.minimapCaves = v));
                r.add(toggle("Other players", () -> c.minimapPlayers, v -> c.minimapPlayers = v));
                r.add(toggle("Mobs", () -> c.minimapMobs, v -> c.minimapMobs = v));
                r.add(cycle("Waypoints", () -> String.valueOf(Waypoints.here(minecraft).size()), () -> Compat.setScreen(minecraft, new WaypointsScreen(this))));
                r.add(toggle("Coordinates under map", () -> c.minimapCoords, v -> c.minimapCoords = v));
                r.add(cycle("Death marker", () -> "Clear", DeathTracker::clear));
                r.add(cycle("Forget explored map", () -> "Click", Minimap::clearCache));
            }
            case 2 -> {
                Float[] zooms = {2f, 3f, 4f, 6f, 8f, 12f};
                r.add(cycle("Zoom strength", () -> Math.round(c.zoomFactor) + "x", () -> c.zoomFactor = zooms[next(zooms, c.zoomFactor)]));
                r.add(toggle("Smooth zoom", () -> c.smoothZoom, v -> c.smoothZoom = v));
                r.add(toggle("Scroll to zoom", () -> c.scrollZoom, v -> c.scrollZoom = v));
                r.add(toggle("FPS boost (fast settings)", FpsBooster::isBoosted, v -> FpsBooster.toggle(minecraft)));
                r.add(toggle("Save power in background", () -> c.backgroundFps, v -> c.backgroundFps = v));
                Integer[] limits = {10, 15, 30, 60};
                r.add(cycle("Background FPS", () -> String.valueOf(c.backgroundFpsLimit), () -> c.backgroundFpsLimit = limits[next(limits, c.backgroundFpsLimit)]));
            }
            default -> {
                r.add(toggle("Pimpin button on menus", () -> c.menuButtons, v -> c.menuButtons = v));
                r.add(toggle("Pimpin loading screen", () -> c.brandedLoading, v -> c.brandedLoading = v));
                r.add(cycle("Controls", () -> "Open", () -> Compat.setScreen(minecraft, keyBinds())));
                r.add(cycle("Mod menu", () -> "Open", () -> Compat.setScreen(minecraft, new ModMenuScreen(this))));
                r.add(cycle("Reset all settings", () -> "Click", () -> {
                    if (c.boostActive) FpsBooster.disable(minecraft);
                    PimpinConfig.reset();
                }));
            }
        }
        return r;
    }

    private Screen keyBinds() {
        //#if MC >= 1.21
        return new net.minecraft.client.gui.screens.options.controls.KeyBindsScreen(this, minecraft.options);
        //#else
        return new net.minecraft.client.gui.screens.controls.KeyBindsScreen(this, minecraft.options);
        //#endif
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
            Button b = Button.builder(Component.literal(i == tab ? "§n" + TABS[i] : TABS[i]), x -> {
                tab = t;
                rebuildWidgets();
            }).bounds(tx + i * (tw + 4), 26, tw, 20).build();
            b.active = i != tab;
            addRenderableWidget(b);
        }
        List<Row> rows = rows();
        int colW = Math.min(170, (width - 50) / 2);
        int left = width / 2 - colW - 5;
        int y0 = 56;
        for (int i = 0; i < rows.size(); i++) {
            Row row = rows.get(i);
            int x = i % 2 == 0 ? left : left + colW + 10;
            int y = y0 + (i / 2) * 24;
            Button b = Button.builder(row.label(), btn -> {
                row.press();
                PimpinConfig.save();
                refreshLabels(rows);
            }).bounds(x, y, colW, 20).build();
            options.add(b);
            addRenderableWidget(b);
        }
        addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose()).bounds(width / 2 - 75, height - 28, 150, 20).build());
    }

    private void refreshLabels(List<Row> rows) {
        for (int i = 0; i < rows.size() && i < options.size(); i++) options.get(i).setMessage(rows.get(i).label());
    }

    @Override
    protected void draw(Draw g, int mouseX, int mouseY, float delta) {
        g.centered(font, "§d✦ §fPimpin Client", width / 2, 10, 0xFFFFFFFF);
    }

    @Override
    public void onClose() {
        PimpinConfig.save();
        Compat.setScreen(minecraft, parent);
    }
}
