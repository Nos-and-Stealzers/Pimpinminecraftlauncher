package dev.pimpin.client.screen;

import dev.pimpin.client.compat.*;
import dev.pimpin.client.feature.Waypoints;
import net.minecraft.client.gui.components.*;
import net.minecraft.client.gui.screens.*;
import net.minecraft.network.chat.Component;

/** Draft editor: cancel never persists partially typed coordinates or names. */
public final class WaypointEditScreen extends BaseScreen {
    private final Screen parent;
    private final Waypoints.Point point;
    private String name, x, y, z, error = "";
    private int color;
    private boolean shown;
    private EditBox nameBox, xBox, yBox, zBox;
    public WaypointEditScreen(Screen parent, Waypoints.Point point) {
        super(Component.literal("Edit waypoint")); this.parent = parent; this.point = point;
        name = point.name; x = Integer.toString(point.x); y = Integer.toString(point.y); z = Integer.toString(point.z);
        color = point.color; shown = point.shown;
    }
    private boolean compact() { return height < 220; }
    private int nameY() { return compact() ? 34 : 48; }
    private int coordsY() { return compact() ? 70 : 88; }
    private int optionsY() { return compact() ? 100 : 120; }
    private int left() { return (width - formWidth()) / 2; }
    private int formWidth() { return Math.min(360, width - 24); }
    private EditBox field(String label, String value, int x, int y, int w, int max) {
        EditBox box = new EditBox(font, x, y, w, 20, Component.literal(label));
        box.setMaxLength(max); box.setValue(value); addRenderableWidget(box); return box;
    }
    @Override protected void init() {
        int l = left(), w = formWidth(), col = (w - 12) / 3;
        nameBox = field("Waypoint name", name, l, nameY(), w, 48);
        nameBox.setResponder(v -> name = v);
        xBox = field("X coordinate", x, l, coordsY(), col, 12); xBox.setResponder(v -> x = v);
        yBox = field("Y coordinate", y, l + col + 6, coordsY(), col, 12); yBox.setResponder(v -> y = v);
        zBox = field("Z coordinate", z, l + 2 * (col + 6), coordsY(), col, 12); zBox.setResponder(v -> z = v);
        addRenderableWidget(Button.builder(Component.literal("Color").withStyle(s -> s.withColor(color & 0xFFFFFF)), b -> {
            int index = 0; for (int i = 0; i < Waypoints.COLORS.length; i++) if (color == Waypoints.COLORS[i]) index = (i + 1) % Waypoints.COLORS.length;
            color = Waypoints.COLORS[index]; rebuildWidgets();
        }).bounds(l, optionsY(), (w - 6) / 2, 20).build());
        addRenderableWidget(Button.builder(Component.literal(shown ? "Visible on maps" : "Hidden on maps"), b -> { shown = !shown; rebuildWidgets(); }).bounds(l + (w - 6) / 2 + 6, optionsY(), (w - 6) / 2, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Delete…"), b -> Compat.setScreen(minecraft, new ConfirmScreen(answer -> {
            if (answer) { Waypoints.remove(minecraft, point); Compat.setScreen(minecraft, parent); }
            else Compat.setScreen(minecraft, this);
        }, Component.literal("Delete waypoint?"), Component.literal("Delete \"" + point.name + "\"? This cannot be undone.")))).bounds(l, height - 26, col, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Cancel"), b -> onClose()).bounds(l + col + 6, height - 26, col, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Save"), b -> saveDraft()).bounds(l + 2 * (col + 6), height - 26, col, 20).build()).active = Waypoints.writable();
        setInitialFocus(nameBox);
    }
    public void saveDraft() {
        String result = Waypoints.edit(minecraft, point.id, name, x, y, z, color, shown);
        if (result == null) Compat.setScreen(minecraft, parent); else error = result;
    }
    @Override protected void draw(Draw g, int mouseX, int mouseY, float delta) {
        int l = left(), w = formWidth(), col = (w - 12) / 3;
        g.centered(font, "Edit waypoint · " + Waypoints.dimension(minecraft), width / 2, 12, 0xFFFFFFFF);
        g.text(font, "Name", l, nameY() - 12, 0xFFB8C1CC);
        g.text(font, "X", l, coordsY() - 12, 0xFFB8C1CC); g.text(font, "Y", l + col + 6, coordsY() - 12, 0xFFB8C1CC); g.text(font, "Z", l + 2 * (col + 6), coordsY() - 12, 0xFFB8C1CC);
        if (!compact()) {
            g.text(font, "X/Z: ±30,000,000 · Y: ±2,048", l, 150, 0xFFB8C1CC);
            g.text(font, "Save applies changes. Escape cancels edits.", l, 164, 0xFFB8C1CC);
        }
        if (!error.isEmpty()) {
            var lines = font.split(Component.literal(error), w);
            for (int i = 0; i < Math.min(compact() ? 1 : 2, lines.size()); i++) g.text(font, lines.get(i), l, (compact() ? 128 : 180) + i * 10, 0xFFFFAA66);
        }
    }
    @Override public void onClose() { Compat.setScreen(minecraft, parent); }
}
