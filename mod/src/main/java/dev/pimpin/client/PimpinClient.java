package dev.pimpin.client;

import com.mojang.blaze3d.platform.InputConstants;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.compat.Hud;
import dev.pimpin.client.compat.Keys;
import dev.pimpin.client.feature.DeathTracker;
import dev.pimpin.client.feature.FpsBooster;
import dev.pimpin.client.feature.LoadingScreen;
import dev.pimpin.client.feature.Waypoints;
import dev.pimpin.client.feature.Zoom;
import dev.pimpin.client.feature.ToggleSprint;
import dev.pimpin.client.feature.ClientQolDevTest;
import dev.pimpin.client.hud.Minimap;
import dev.pimpin.client.hud.PimpinHud;
import dev.pimpin.client.screen.ModMenuScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class PimpinClient implements ClientModInitializer {
    public static final Logger LOG = LoggerFactory.getLogger("Pimpin Client");

    public static KeyMapping zoomKey;
    public static KeyMapping menuKey;
    public static KeyMapping minimapKey;
    public static KeyMapping minimapZoomKey;
    public static KeyMapping bigMapKey;
    public static KeyMapping boostKey;
    public static KeyMapping waypointKey;
    public static KeyMapping toggleSprintKey;

    @Override
    public void onInitializeClient() {
        PimpinConfig.load();
        ClientLifecycleEvents.CLIENT_STARTED.register(ToggleSprint::recover);
        zoomKey = Keys.register("zoom", InputConstants.KEY_Z);
        menuKey = Keys.register("menu", InputConstants.KEY_RSHIFT);
        minimapKey = Keys.register("minimap", InputConstants.KEY_M);
        minimapZoomKey = Keys.register("minimap_zoom", InputConstants.KEY_N);
        bigMapKey = Keys.register("big_map", InputConstants.KEY_J);
        boostKey = Keys.register("boost", InputConstants.UNKNOWN.getValue());
        waypointKey = Keys.register("waypoint", InputConstants.KEY_B);
        toggleSprintKey = Keys.register("toggle_sprint", InputConstants.UNKNOWN.getValue());

        ClientTickEvents.END_CLIENT_TICK.register(PimpinClient::tick);
        Hud.register(PimpinHud::render);
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
            ToggleSprint.restore(client);
            PimpinHud.reset();
        });
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
            FpsBooster.restoreBackgroundLimit(client);
            ToggleSprint.restore(client);
            ClientQolDevTest.stopping(client);
            PimpinConfig.save();
        });
        ScreenEvents.AFTER_INIT.register((client, screen, width, height) -> {
            if (screen instanceof TitleScreen) LoadingScreen.gameReady();
            if (!PimpinConfig.get().menuButtons) return;
            if (screen instanceof TitleScreen || screen instanceof PauseScreen) {
                //#if MC >= 26.1
                var widgets = Screens.getWidgets(screen);
                //#else
                var widgets = Screens.getButtons(screen);
                //#endif
                widgets.add(Button.builder(Component.literal("✦ Pimpin"), b -> Compat.setScreen(client, new ModMenuScreen(screen)))
                        .bounds(4, 4, 70, 20)
                        .tooltip(Tooltip.create(Component.literal("Mods, Pimpin settings and FPS booster")))
                        .build());
            }
        });
        LOG.info("Pimpin Client ready");
    }

    private static void tick(Minecraft client) {
        PimpinConfig cfg = PimpinConfig.get();
        while (menuKey.consumeClick()) {
            if (Compat.screen(client) == null) Compat.setScreen(client, new ModMenuScreen(null));
        }
        while (minimapKey.consumeClick()) {
            cfg.minimap = !cfg.minimap;
            PimpinConfig.save();
        }
        while (minimapZoomKey.consumeClick()) {
            Minimap.cycleZoom(client);
        }
        while (boostKey.consumeClick()) {
            FpsBooster.toggle(client);
        }
        while (waypointKey.consumeClick()) {
            if (client.player == null) continue;
            Waypoints.Point w = Waypoints.addHere(client);
            if (w != null) Compat.actionBar(client, "§b" + w.name + "§7 added at " + w.x + " " + w.y + " " + w.z);
            else Compat.actionBar(client, "§c" + (Waypoints.error() == null ? "Could not add waypoint here." : Waypoints.error()));
        }
        Zoom.tick(client);
        while (toggleSprintKey.consumeClick()) {
            if (client.player == null || Compat.screen(client) != null) continue;
            cfg.toggleSprint = !cfg.toggleSprint;
            PimpinConfig.save();
        }
        ToggleSprint.tick(client);
        ClientQolDevTest.tick(client);
        FpsBooster.tick(client);
        DeathTracker.tick(client);
        Minimap.tick(client);
        PimpinHud.tick(client);
    }
}
