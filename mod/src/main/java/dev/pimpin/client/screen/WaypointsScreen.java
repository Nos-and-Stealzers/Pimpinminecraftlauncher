package dev.pimpin.client.screen;

import dev.pimpin.client.compat.BaseScreen;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.compat.Draw;
import dev.pimpin.client.feature.Waypoints;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.network.chat.Component;
import java.util.*;

/** Paged list with explicit edits and keyboard-accessible controls. */
public final class WaypointsScreen extends BaseScreen {
    private static final int ROW = 38;
    private final Screen parent;
    private int page;
    private boolean nearest, refreshing;
    private String query = "";
    private List<Waypoints.Point> filtered = List.of();
    public WaypointsScreen(Screen parent) { super(Component.literal("Waypoints")); this.parent = parent; }
    private int top() { return Waypoints.error() == null && !Waypoints.legacyAvailable(minecraft) ? 76 : 100; }
    private int rows() { return Math.max(1, (height - top() - 60) / ROW); }
    private int contentWidth() { return Math.min(600, width - 24); }
    private void filter() {
        filtered = Waypoints.here(minecraft).stream()
                .filter(p -> p.name.toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT)))
                .sorted(nearest && minecraft.player != null ? Comparator.<Waypoints.Point>comparingDouble(p -> p.pos().distSqr(minecraft.player.blockPosition())).thenComparing(p -> p.name, String.CASE_INSENSITIVE_ORDER)
                        : Comparator.comparing(p -> p.name, String.CASE_INSENSITIVE_ORDER)).toList();
        page = Math.max(0, Math.min(page, Math.max(0, (filtered.size() - 1) / rows())));
    }
    @Override protected void init() {
        refreshing = true; filter();
        int w = contentWidth(), x = (width - w) / 2;
        EditBox search = new EditBox(font, x, 46, w - 108, 20, Component.literal("Search waypoints"));
        search.setMaxLength(48); search.setValue(query);
        search.setResponder(value -> { if (!refreshing) { query = value; page = 0; rebuildWidgets(); } });
        addRenderableWidget(search);
        if (!query.isEmpty()) { setInitialFocus(search); search.setCursorPosition(query.length()); }
        addRenderableWidget(Button.builder(Component.literal(nearest ? "Sort: distance" : "Sort: name"), b -> { nearest = !nearest; page = 0; rebuildWidgets(); }).bounds(x + w - 102, 46, 102, 20).build()).active = minecraft.player != null;
        for (int i = page * rows(); i < filtered.size() && i < (page + 1) * rows(); i++) {
            Waypoints.Point point = filtered.get(i); int y = top() + (i - page * rows()) * ROW;
            addRenderableWidget(Button.builder(Component.literal("Edit"), b -> Compat.setScreen(minecraft, new WaypointEditScreen(this, point))).bounds(x + w - 118, y + 2, 54, 20).build()).active = Waypoints.writable();
            boolean tracked = Waypoints.selectedTarget(minecraft) != null && point.id.equals(Waypoints.selectedTarget(minecraft).id());
            addRenderableWidget(Button.builder(Component.literal(tracked ? "Stop" : "Track"), b -> { Waypoints.track(minecraft, tracked ? null : point); rebuildWidgets(); }).bounds(x + w - 60, y + 2, 60, 20).build());
        }
        int by = height - 26, third = (w - 12) / 3;
        addRenderableWidget(Button.builder(Component.literal("Add here"), b -> { Waypoints.Point point = Waypoints.addHere(minecraft); if (point != null) Compat.setScreen(minecraft, new WaypointEditScreen(this, point)); }).bounds(x, by, third, 20).build()).active = minecraft.player != null && Waypoints.writable();
        addRenderableWidget(Button.builder(Component.literal("Display"), b -> Compat.setScreen(minecraft, new WaypointOptionsScreen(this))).bounds(x + third + 6, by, third, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose()).bounds(x + 2 * (third + 6), by, third, 20).build());
        addRenderableWidget(Button.builder(Component.literal("<"), b -> { page--; rebuildWidgets(); }).bounds(x, height - 50, 28, 20).build()).active = page > 0;
        addRenderableWidget(Button.builder(Component.literal(">"), b -> { page++; rebuildWidgets(); }).bounds(x + w - 28, height - 50, 28, 20).build()).active = (page + 1) * rows() < filtered.size();
        refreshing = false;
        if (Waypoints.legacyAvailable(minecraft)) {
            addRenderableWidget(Button.builder(Component.literal("Recover legacy…"), b -> Compat.setScreen(minecraft, new ConfirmScreen(answer -> {
                if (answer) Waypoints.recoverLegacy(minecraft);
                Compat.setScreen(minecraft, this);
            }, Component.literal("Recover old world markers?"), Component.literal("Old markers used only the world name. Confirm these belong to THIS save. A backup is kept; other same-name saves will not receive them.")))).bounds(x + w - 118, 74, 118, 20).build()).active = Waypoints.writable();
        }
    }
    @Override protected boolean onScroll(double x, double y, double amount) {
        if (y < top() || y >= height - 50 || amount == 0) return false;
        int next = Math.max(0, Math.min(Math.max(0, (filtered.size() - 1) / rows()), page + (amount > 0 ? -1 : 1)));
        if (next == page) return false;
        page = next; rebuildWidgets(); return true;
    }
    @Override protected void draw(Draw g, int mouseX, int mouseY, float delta) {
        int w = contentWidth(), x = (width - w) / 2;
        g.centered(font, "Waypoints", width / 2, 12, 0xFFFFFFFF);
        g.centered(font, "Search by name · " + Waypoints.dimension(minecraft), width / 2, 28, 0xFFB8C1CC);
        if (Waypoints.error() != null) g.text(font, font.plainSubstrByWidth(Waypoints.error(), w), x, 74, 0xFFFFAA66);
        else if (Waypoints.legacyAvailable(minecraft)) g.text(font, font.plainSubstrByWidth("Old world markers found", w - 124), x, 80, 0xFFFFCC77);
        if (filtered.isEmpty()) g.centered(font, query.isEmpty() ? "No waypoints here. Use Add here." : "No matching names.", width / 2, top() + 12, 0xFFB8C1CC);
        for (int i = page * rows(); i < filtered.size() && i < (page + 1) * rows(); i++) {
            Waypoints.Point point = filtered.get(i); int y = top() + (i - page * rows()) * ROW;
            g.fill(x, y + 3, x + 4, y + 30, point.shown ? point.color : 0xFF666666);
            g.text(font, font.plainSubstrByWidth(point.name + (point.shown ? "" : " (hidden)"), w - 134), x + 10, y + 3, point.shown ? 0xFFFFFFFF : 0xFF999999);
            String details = point.x + ", " + point.y + ", " + point.z + " · " + Waypoints.distanceText(minecraft, point);
            g.text(font, font.plainSubstrByWidth(details, w - 134), x + 10, y + 17, 0xFFB8C1CC);
        }
        g.centered(font, filtered.size() + " markers · Page " + (page + 1) + "/" + Math.max(1, (filtered.size() + rows() - 1) / rows()), width / 2, height - 44, 0xFFB8C1CC);
    }
    @Override public void onClose() { Compat.setScreen(minecraft, parent); }
}
