package dev.pimpin.client.screen;

import dev.pimpin.client.compat.BaseScreen;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.compat.Draw;
import dev.pimpin.client.feature.Waypoints;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.List;

/** Lists the waypoints of the current world: rename, recolour, hide, delete. */
public final class WaypointsScreen extends BaseScreen {
    private static final int ROW = 24;
    private final Screen parent;
    private int scroll;

    public WaypointsScreen(Screen parent) {
        super(Component.literal("Waypoints"));
        this.parent = parent;
    }

    private List<Waypoints.Point> points() {
        return Waypoints.here(minecraft);
    }

    private int visibleRows() {
        return Math.max(1, (height - 100) / ROW);
    }

    @Override
    protected void init() {
        List<Waypoints.Point> list = points();
        scroll = Math.max(0, Math.min(scroll, list.size() - visibleRows()));
        int w = Math.min(360, width - 20);
        int x = (width - w) / 2;
        int y = 40;
        for (int i = scroll; i < list.size() && i < scroll + visibleRows(); i++) {
            Waypoints.Point p = list.get(i);
            EditBox name = new EditBox(font, x + 14, y, w - 150, 20, Component.literal("Name"));
            name.setMaxLength(32);
            name.setValue(p.name);
            name.setResponder(v -> p.name = v);
            addRenderableWidget(name);
            addRenderableWidget(Button.builder(Component.literal("■").withStyle(s -> s.withColor(p.color & 0xFFFFFF)), b -> {
                int next = 0;
                for (int c = 0; c < Waypoints.COLORS.length; c++) if (Waypoints.COLORS[c] == p.color) next = (c + 1) % Waypoints.COLORS.length;
                p.color = Waypoints.COLORS[next];
                rebuild();
            }).bounds(x + w - 132, y, 20, 20).build());
            addRenderableWidget(Button.builder(Component.literal(p.shown ? "Shown" : "§7Hidden"), b -> {
                p.shown = !p.shown;
                rebuild();
            }).bounds(x + w - 108, y, 52, 20).build());
            addRenderableWidget(Button.builder(Component.literal("§cDelete"), b -> {
                Waypoints.remove(minecraft, p);
                rebuild();
            }).bounds(x + w - 52, y, 52, 20).build());
            y += ROW;
        }
        int by = height - 28;
        addRenderableWidget(Button.builder(Component.literal("Add here"), b -> {
            Waypoints.addHere(minecraft);
            scroll = Integer.MAX_VALUE;
            rebuild();
        }).bounds(width / 2 - 154, by, 150, 20).build()).active = minecraft.player != null;
        addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose()).bounds(width / 2 + 4, by, 150, 20).build());
    }

    private void rebuild() {
        Waypoints.save();
        rebuildWidgets();
    }

    @Override
    protected boolean onScroll(double x, double y, double amount) {
        int max = Math.max(0, points().size() - visibleRows());
        int next = Math.max(0, Math.min(max, scroll + (amount > 0 ? -1 : 1)));
        if (next == scroll) return false;
        scroll = next;
        rebuildWidgets();
        return true;
    }

    @Override
    protected void draw(Draw g, int mouseX, int mouseY, float delta) {
        g.centered(font, "§fWaypoints §7in this world", width / 2, 14, 0xFFFFFFFF);
        List<Waypoints.Point> list = points();
        if (list.isEmpty()) {
            g.centered(font, "§7None yet. Press " + Compat.keyName(dev.pimpin.client.PimpinClient.waypointKey) + " in game or use Add here.", width / 2, 60, 0xFFFFFFFF);
            return;
        }
        int w = Math.min(360, width - 20);
        int x = (width - w) / 2;
        int y = 40;
        for (int i = scroll; i < list.size() && i < scroll + visibleRows(); i++) {
            Waypoints.Point p = list.get(i);
            g.fill(x, y + 4, x + 8, y + 16, p.color);
            if (minecraft.player != null) {
                int dist = (int) Math.sqrt(p.pos().distSqr(minecraft.player.blockPosition()));
                g.text(font, "§7" + p.x + " " + p.y + " " + p.z + "  " + dist + "m", x + 14, y + 22 - 1, 0xFFFFFFFF);
            }
            y += ROW;
        }
    }

    @Override
    public void onClose() {
        Waypoints.save();
        Compat.setScreen(minecraft, parent);
    }
}
