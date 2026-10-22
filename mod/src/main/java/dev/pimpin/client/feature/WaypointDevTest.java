package dev.pimpin.client.feature;

import dev.pimpin.client.PimpinClient;
import dev.pimpin.client.compat.*;
import dev.pimpin.client.screen.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.components.*;
import net.minecraft.client.gui.screens.*;
import net.minecraft.network.chat.Component;

/** Opt-in fixture entrypoint injected only into a development run by the test init script.
 * It drives real widgets, not physical keyboard/mouse input. Never joins a server. */
public final class WaypointDevTest implements ClientModInitializer {
    private static int ticks, checks;
    private static boolean initialized;
    private static Waypoints.Point first;
    @Override public void onInitializeClient() {
        if (FabricLoader.getInstance().isDevelopmentEnvironment() && Boolean.getBoolean("pimpin.dev.waypointTest"))
            ClientTickEvents.END_CLIENT_TICK.register(WaypointDevTest::tick);
    }
    private static void check(boolean value, String message) {
        if (!value) throw new IllegalStateException("WAYPOINT_TEST FAILED: " + message);
        checks++; PimpinClient.LOG.info("WAYPOINT_TEST PASS: {}", message);
    }
    private static void press(Minecraft mc, String message) {
        var screen = Compat.screen(mc);
        var button = screen.children().stream().filter(c -> c instanceof Button b && b.getMessage().getString().equals(message)).map(c -> (Button)c).findFirst().orElseThrow();
        check(button.active, "button active: " + message); Compat.press(button);
    }
    private static EditBox field(Minecraft mc, String message) {
        return Compat.screen(mc).children().stream().filter(c -> c instanceof EditBox box && box.getMessage().getString().equals(message)).map(c -> (EditBox)c).findFirst().orElseThrow();
    }
    public static void tick(Minecraft mc) {
        if (!FabricLoader.getInstance().isDevelopmentEnvironment() || !Boolean.getBoolean("pimpin.dev.waypointTest") || mc.player == null || mc.level == null) return;
        try {
            if (!initialized) {
                if (!Waypoints.fixture(mc)) return;
                initialized = true;
            }
            switch (++ticks) {
                case 20 -> {
                    check(Waypoints.here(mc).isEmpty(), "fresh isolated fixture");
                    first = Waypoints.addHere(mc);
                    check(first != null, "add current location");
                    check(Waypoints.edit(mc, first.id, "Alpha base", "120", "70", "-240", Waypoints.COLORS[1], true) == null, "edit name coordinates color visibility");
                    for (int i = 0; i < 18; i++) {
                        var p = Waypoints.addHere(mc);
                        Waypoints.edit(mc, p.id, "Marker " + i, Integer.toString(i * 45), "64", "12", Waypoints.COLORS[i % Waypoints.COLORS.length], true);
                    }
                    Compat.setScreen(mc, new WaypointsScreen(null));
                    check(Waypoints.here(mc).size() == 19, "19 persisted fixture markers");
                }
                case 40 -> shot(mc, "waypoint-list");
                case 50 -> {
                    press(mc, ">");
                    check(Compat.screen(mc) instanceof WaypointsScreen, "next page remains usable");
                    field(mc, "Search waypoints").setValue("Alpha");
                    long edits = Compat.screen(mc).children().stream().filter(c -> c instanceof Button b && b.getMessage().getString().equals("Edit")).count();
                    check(edits == 1, "search narrows real rows");
                    press(mc, "Sort: name");
                    press(mc, "Track");
                    check(Waypoints.selectedTarget(mc) != null && Waypoints.selectedTarget(mc).id().equals(first.id), "tracked immutable target");
                }
                case 60 -> shot(mc, "waypoint-search");
                case 70 -> {
                    press(mc, "Edit");
                    field(mc, "X coordinate").setValue("1e3");
                    press(mc, "Save");
                    check(Compat.screen(mc) instanceof WaypointEditScreen && first.x == 120, "invalid coordinate stays in editor without mutation");
                }
                case 80 -> shot(mc, "waypoint-invalid");
                case 90 -> {
                    field(mc, "X coordinate").setValue("-512");
                    field(mc, "Waypoint name").setValue("Edited base");
                    press(mc, "Save");
                    check(first.x == -512 && first.name.equals("Edited base"), "valid draft committed");
                    field(mc, "Search waypoints").setValue("Edited");
                    press(mc, "Edit"); press(mc, "Delete…");
                    check(Compat.screen(mc) instanceof ConfirmScreen && Waypoints.here(mc).size() == 19, "delete requires confirmation");
                }
                case 100 -> shot(mc, "waypoint-confirm");
                case 110 -> {
                    press(mc, "No");
                    check(Waypoints.here(mc).size() == 19, "cancel deletion preserves marker");
                    press(mc, "Cancel");
                    Compat.setScreen(mc, new BaseScreen(Component.literal("Navigation preview")) {
                        @Override protected void draw(Draw d, int x, int y, float delta) {
                            WaypointNavigation.render(d, minecraft);
                            d.centered(font, "Development navigation rendering fixture", width / 2, height - 24, 0xFFFFFFFF);
                        }
                    });
                }
                case 120 -> shot(mc, "waypoint-navigation");
                case 130 -> {
                    Waypoints.track(mc, null);
                    check(Waypoints.selectedTarget(mc) == null, "stop tracking clears navigation");
                    Compat.setScreen(mc, new WaypointEditScreen(new WaypointsScreen(null), first));
                    press(mc, "Delete…"); press(mc, "Yes");
                    check(Waypoints.here(mc).size() == 18, "confirmed deletion removes only target ID");
                }
                case 135 -> {
                    Compat.setScreen(mc, new WaypointEditScreen(new WaypointsScreen(null), Waypoints.here(mc).get(0)));
                    var editor = Compat.screen(mc); Compat.resizeScreen(editor, mc, 320, 180);
                    var widgets = editor.children().stream().filter(c -> c instanceof AbstractWidget).map(c -> (AbstractWidget)c).toList();
                    boolean fits = true;
                    for (int i=0; i<widgets.size(); i++) {
                        var a=widgets.get(i);
                        fits &= a.getX()>=0 && a.getY()>=0 && a.getX()+a.getWidth()<=320 && a.getY()+a.getHeight()<=180;
                        for (int j=0; j<i; j++) { var b=widgets.get(j); fits &= !(a.getX()<b.getX()+b.getWidth() && a.getX()+a.getWidth()>b.getX() && a.getY()<b.getY()+b.getHeight() && a.getY()+a.getHeight()>b.getY()); }
                    }
                    check(fits, "coordinate editor fits 320x180 without overlapping widgets");
                }
                case 138 -> shot(mc, "waypoint-editor-compact");
                case 140 -> {
                    Compat.screen(mc).onClose();
                    var list = Compat.screen(mc); Compat.resizeScreen(list, mc, 320, 240);
                    check(list.children().stream().filter(c -> c instanceof AbstractWidget).map(c -> (AbstractWidget)c).allMatch(w -> w.getX() >= 0 && w.getY() >= 0 && w.getX() + w.getWidth() <= 320 && w.getY() + w.getHeight() <= 240), "all interactive widgets fit minimum viewport");
                }
                case 150 -> shot(mc, "waypoint-compact");
                case 160 -> {
                    check(Waypoints.error() == null, "fixture persistence has no errors");
                    PimpinClient.LOG.info("WAYPOINT_TEST COMPLETE: {} checks (real game widget automation, not physical input)", checks);
                    mc.stop();
                }
            }
        } catch (Throwable e) { PimpinClient.LOG.error("WAYPOINT_TEST FAILED", e); mc.stop(); }
    }
    private static void shot(Minecraft mc, String name) {
        //#if MC >= 26.2
        Screenshot.grab(mc.gameDirectory, name + ".png", mc.gameRenderer.mainRenderTarget(), 1, m -> PimpinClient.LOG.info("WAYPOINT_SCREENSHOT {}", name));
        //#elseif MC >= 1.21.6
        Screenshot.grab(mc.gameDirectory, name + ".png", mc.getMainRenderTarget(), 1, m -> PimpinClient.LOG.info("WAYPOINT_SCREENSHOT {}", name));
        //#else
        Screenshot.grab(mc.gameDirectory, name + ".png", mc.getMainRenderTarget(), m -> PimpinClient.LOG.info("WAYPOINT_SCREENSHOT {}", name));
        //#endif
    }
}
