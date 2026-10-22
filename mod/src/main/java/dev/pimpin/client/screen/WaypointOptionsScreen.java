package dev.pimpin.client.screen;

import dev.pimpin.client.compat.*;
import dev.pimpin.client.feature.WaypointPreferences;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class WaypointOptionsScreen extends BaseScreen {
    private final Screen parent;
    public WaypointOptionsScreen(Screen parent) { super(Component.literal("Waypoint display")); this.parent = parent; }
    @Override protected void init() {
        int w = Math.min(320, width - 24), x = (width - w) / 2;
        addRenderableWidget(Button.builder(Component.literal("Map labels: " + (WaypointPreferences.labels() ? "On" : "Off")), b -> { WaypointPreferences.toggleLabels(); rebuildWidgets(); }).bounds(x, 52, w, 20).build()).active = WaypointPreferences.writable();
        addRenderableWidget(Button.builder(Component.literal("Marker range: " + (WaypointPreferences.range() == 0 ? "Unlimited" : WaypointPreferences.range() + " m")), b -> { WaypointPreferences.cycleRange(); rebuildWidgets(); }).bounds(x, 80, w, 20).build()).active = WaypointPreferences.writable();
        addRenderableWidget(Button.builder(Component.literal("Tracked navigation: " + (WaypointPreferences.navigation() ? "On" : "Off")), b -> { WaypointPreferences.toggleNavigation(); rebuildWidgets(); }).bounds(x, 108, w, 20).build()).active = WaypointPreferences.writable();
        addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose()).bounds(x, height - 28, w, 20).build());
    }
    @Override protected void draw(Draw g, int mx, int my, float delta) {
        g.centered(font, "Waypoint display", width / 2, 18, 0xFFFFFFFF);
        g.centered(font, "Tracking is limited to this world and dimension.", width / 2, 144, 0xFFB8C1CC);
        g.centered(font, "A tracked target ignores the marker range.", width / 2, 158, 0xFFB8C1CC);
        if (!WaypointPreferences.writable()) g.centered(font, "Display file unreadable; changes disabled.", width / 2, 180, 0xFFFFAA66);
    }
    @Override public void onClose() { Compat.setScreen(minecraft, parent); }
}
