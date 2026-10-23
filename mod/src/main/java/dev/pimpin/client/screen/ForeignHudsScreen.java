package dev.pimpin.client.screen;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.PimpinConfig.ForeignPlacement;
import dev.pimpin.client.compat.BaseScreen;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.compat.Draw;
import dev.pimpin.client.hud.ForeignHuds;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.List;
import java.util.Locale;

/**
 * Lists the HUD elements other mods draw (all of them are intercepted at
 * registration) with nudge/scale/hide buttons per row. Click = small step,
 * Shift+click = big step. Every change applies live once you leave a screen.
 */
public final class ForeignHudsScreen extends BaseScreen {
    private static final int ROW_H = 30;
    private static final int BTN = 20;

    private final Screen parent;
    private List<String> keys;
    private int selected = -1;
    private int selectedKeyIndex = -1;
    private double scroll;

    public ForeignHudsScreen(Screen parent) {
        super(Component.literal("Other mod HUDs"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        keys = ForeignHuds.keys();
        int bw = Math.min(90, (width - 40) / 3);
        int y = height - 26;
        addRenderableWidget(net.minecraft.client.gui.components.Button.builder(
                Component.literal("Reset all"), b -> resetAll()).bounds(10, y, bw, 20).build());
        addRenderableWidget(net.minecraft.client.gui.components.Button.builder(
                Component.literal("Done"), b -> onClose()).bounds(width - bw - 10, y, bw, 20).build());
    }

    private void resetAll() {
        ForeignHuds.clearAll();
        selected = -1;
    }

    @Override
    public void onClose() {
        Compat.setScreen(minecraft, parent);
    }

    private int listTop() { return 30; }
    private int listBottom() { return height - 36; }
    private int listHeight() { return listBottom() - listTop(); }
    private int listX() { return 10; }
    private int listW() { return Math.min(width - 20, 640); }

    @Override
    protected void draw(Draw g, int mx, int my, float delta) {
        int accent = 0xFFB56CFF;
        g.text(font, "§lHUD elements of other mods §r§7- " + keys.size() + " found", 10, 8, 0xFFFFFFFF);
        g.text(font, "Click = nudge (§oShift§7 x8) | Hidden elements stay invisible until shown", 10, 19, 0xFF9A9A9A);

        int x = listX(), w = listW();
        g.fill(x, listTop(), x + w, listBottom(), 0x66000000);
        g.scissor(x, listTop(), x + w, listBottom());
        int y = listTop() - (int) scroll;
        for (int i = 0; i < keys.size(); i++) {
            String key = keys.get(i);
            if (y + ROW_H >= listTop() && y <= listBottom()) {
                boolean hover = mx >= x && mx < x + w && my >= y && my < y + ROW_H;
                if (i == selected) g.fill(x, y, x + w, y + ROW_H, (accent & 0x00FFFFFF) | 0x55000000);
                else if (hover) g.fill(x, y, x + w, y + ROW_H, 0x33FFFFFF);
                g.text(font, font.plainSubstrByWidth(ForeignHuds.label(key), 220), x + 4, y + 4, 0xFFFFFFFF);
                ForeignPlacement p = ForeignHuds.state(key);
                String state = ForeignHuds.stateText(key);
                g.text(font, state, x + 4, y + 16, p != null && p.hidden ? 0xFFFF8080 : 0xFF9A9A9A);
                rowButtons(g, x + w - 246, y, hover);
            }
            y += ROW_H;
        }
        g.noScissor();
        if (keys.isEmpty()) {
            g.centered(font, "Nothing yet - HUDs added by other mods appear here", x + w / 2, listTop() + 14, 0xFF9A9A9A);
            g.centered(font, "after a world opened with those mods active", x + w / 2, listTop() + 26, 0xFF9A9A9A);
        }
    }

    /** Fixed control pads at the row end: dx, dy, scale, hide/show. */
    private void rowButtons(Draw g, int x, int y, boolean hover) {
        pad(g, x, y, 20, "<", hover);
        pad(g, x + 22, y, 20, ">", hover);
        pad(g, x + 44, y, 20, "^", hover);
        pad(g, x + 66, y, 20, "v", hover);
        pad(g, x + 90, y, 20, "-", hover);
        pad(g, x + 112, y, 20, "+", hover);
        ForeignPlacement p = ForeignHuds.state(selectedKey());
        String scale = String.format(Locale.ROOT, "%.2f", p == null ? 1 : p.scale);
        pad(g, x + 134, y, 26, scale, hover);
        pad(g, x + 162, y, 24, p != null && p.hidden ? "Show" : "Hide", hover);
        pad(g, x + 188, y, 24, "Reset", hover);
        pad(g, x + 214, y, 32, stateChip(p), hover);
    }

    private String stateChip(ForeignPlacement p) {
        if (p == null) return "0,0";
        return String.format(Locale.ROOT, "%+.0f,%+.0f", p.dx, p.dy);
    }

    private void pad(Draw g, int x, int y, int w, String label, boolean hover) {
        int y0 = y + 3, h = ROW_H - 8;
        g.fill(x, y0, x + w, y0 + h, 0x88232932);
        g.fill(x, y0, x + w, y0 + 1, 0x88363A46);
        g.fill(x, y0 + h - 1, x + w, y0 + h, 0x88181B22);
        g.centered(font, label, x + w / 2, y0 + (h - 8) / 2 + 1, hover ? 0xFFFFFFFF : 0xFFCFCFE4);
    }

    private String selectedKey() {
        return selectedKeyIndex >= 0 && selectedKeyIndex < keys.size() ? keys.get(selectedKeyIndex) : null;
    }

    @Override
    protected boolean onClick(double mx, double my, int button) {
        if (button != 0) return false;
        int x = listX(), w = listW();
        if (mx < x || mx >= x + w || my < listTop() || my >= listBottom()) { selected = -1; return false; }
        int index = (int) ((my - listTop() + scroll) / ROW_H);
        if (index < 0 || index >= keys.size()) return false;
        selected = index;
        selectedKeyIndex = index;
        String key = keys.get(index);
        double rel = mx - (x + w - 246);
        boolean shift = lastShift;
        float step = shift ? 32 : 4;
        if (rel >= 0 && rel < 20) nudge(key, -step, 0, 0);
        else if (rel >= 22 && rel < 42) nudge(key, step, 0, 0);
        else if (rel >= 44 && rel < 64) nudge(key, 0, -step, 0);
        else if (rel >= 66 && rel < 86) nudge(key, 0, step, 0);
        else if (rel >= 90 && rel < 110) scale(key, -(shift ? 0.25f : 0.05f));
        else if (rel >= 112 && rel < 132) scale(key, shift ? 0.25f : 0.05f);
        else if (rel >= 162 && rel < 186) toggleHide(key);
        else if (rel >= 188 && rel < 212) ForeignHuds.remove(key);
        else return false;
        return true;
    }

    private void nudge(String key, float dx, float dy, int ignored) {
        ForeignPlacement p = ForeignHuds.ensure(key);
        p.dx += dx;
        p.dy += dy;
        PimpinConfig.save();
    }

    private void scale(String key, float delta) {
        ForeignPlacement p = ForeignHuds.ensure(key);
        p.scale = Float.isFinite(p.scale + delta) ? Math.max(.25f, Math.min(3f, p.scale + delta)) : p.scale;
        PimpinConfig.save();
    }

    private void toggleHide(String key) {
        ForeignPlacement p = ForeignHuds.ensure(key);
        p.hidden = !p.hidden;
        PimpinConfig.save();
    }

    @Override
    protected boolean onScroll(double mx, double my, double amount) {
        double max = Math.max(0, keys.size() * ROW_H - listHeight());
        scroll = Math.max(0, Math.min(max, scroll - amount * ROW_H * 2));
        return true;
    }
}
