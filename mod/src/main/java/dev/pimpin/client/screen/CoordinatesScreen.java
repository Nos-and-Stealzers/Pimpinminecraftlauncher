package dev.pimpin.client.screen;

import dev.pimpin.client.compat.BaseScreen;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.compat.Draw;
import dev.pimpin.client.feature.Coordinates;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Explicit clipboard actions; nothing is shared with chat or sent to the server. */
public final class CoordinatesScreen extends BaseScreen {
    private final Screen parent;
    private Button current, destination;
    private String status = "";
    private int statusTicks;
    private Object world;
    public CoordinatesScreen(Screen parent) { super(Component.literal("Copy coordinates")); this.parent = parent; }
    @Override protected void init() {
        int w = Math.min(320, width - 24), x = (width - w) / 2;
        current = addRenderableWidget(Button.builder(Component.literal("Copy current location"), b -> copy(false)).bounds(x, 52, w, 20).build());
        destination = addRenderableWidget(Button.builder(Component.literal("Copy destination"), b -> copy(true)).bounds(x, 96, w, 20)
            .tooltip(Tooltip.create(Component.literal("Overworld / Nether only. X and Z scale by 8; Y is unchanged. This does not locate a safe portal."))).build());
        addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose()).bounds(x, height - 28, w, 20).build());
        refresh();
    }
    private void copy(boolean converted) {
        try {
            status = Coordinates.copy(minecraft, converted) ? "Copied to clipboard" : "No coordinates available";
        } catch (RuntimeException e) {
            status = "Clipboard unavailable";
        }
        statusTicks = 60;
        refresh();
    }
    private void refresh() {
        if (world != minecraft.level) { world = minecraft.level; status = ""; statusTicks = 0; }
        String here = Coordinates.text(minecraft, false), there = Coordinates.text(minecraft, true);
        current.active = here != null;
        destination.active = there != null;
        destination.setMessage(Component.literal(there == null ? "No destination conversion" : "Copy " + there.substring(0, there.indexOf(':')) + " destination"));
    }
    @Override public void tick() {
        refresh();
        if (statusTicks > 0 && --statusTicks == 0) status = "";
    }
    @Override protected void draw(Draw g, int mx, int my, float delta) {
        refresh();
        int w = Math.min(320, width - 24), x = (width - w) / 2;
        String here = Coordinates.text(minecraft, false), there = Coordinates.text(minecraft, true);
        g.centered(font, "Copy coordinates", width / 2, 14, 0xFFFFFFFF);
        g.text(font, font.plainSubstrByWidth(here == null ? "Join a world to copy coordinates" : here, w), x, 38, 0xFFDDE2E8);
        g.text(font, font.plainSubstrByWidth(there == null ? "Only Overworld / Nether can convert" : there, w), x, 82, 0xFFDDE2E8);
        g.text(font, font.plainSubstrByWidth("Portal estimate; Y unchanged. Check terrain.", w), x, 124, 0xFFB8C1CC);
        if (!status.isEmpty()) g.centered(font, status, width / 2, height - 42, 0xFF99DDB0);
    }
    @Override public void onClose() { Compat.setScreen(minecraft, parent); }
}
