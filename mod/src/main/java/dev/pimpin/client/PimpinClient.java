package dev.pimpin.client;

import dev.pimpin.client.feature.DeathTracker;
import dev.pimpin.client.feature.FpsBooster;
import dev.pimpin.client.feature.Zoom;
import dev.pimpin.client.hud.PimpinHud;
import dev.pimpin.client.hud.Minimap;
import dev.pimpin.client.screen.ModMenuScreen;
import dev.pimpin.client.screen.PimpinSettingsScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.GameMenuScreen;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class PimpinClient implements ClientModInitializer {
    public static final Logger LOG = LoggerFactory.getLogger("Pimpin Client");
    private static final String CATEGORY = "key.categories.pimpin";

    public static KeyBinding zoomKey;
    public static KeyBinding menuKey;
    public static KeyBinding minimapKey;
    public static KeyBinding minimapZoomKey;
    public static KeyBinding boostKey;

    @Override
    public void onInitializeClient() {
        PimpinConfig.load();
        zoomKey = key("zoom", GLFW.GLFW_KEY_Z);
        menuKey = key("menu", GLFW.GLFW_KEY_RIGHT_SHIFT);
        minimapKey = key("minimap", GLFW.GLFW_KEY_M);
        minimapZoomKey = key("minimap_zoom", GLFW.GLFW_KEY_N);
        boostKey = key("boost", GLFW.GLFW_KEY_UNKNOWN);

        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
        HudRenderCallback.EVENT.register(PimpinHud::render);
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
            FpsBooster.restoreBackgroundLimit(client);
            PimpinConfig.save();
        });
        ScreenEvents.AFTER_INIT.register((client, screen, width, height) -> {
            if (!PimpinConfig.get().menuButtons) return;
            if (screen instanceof TitleScreen || screen instanceof GameMenuScreen) {
                Screens.getButtons(screen).add(ButtonWidget.builder(Text.literal("✦ Pimpin"), b -> client.setScreen(new ModMenuScreen(screen)))
                        .dimensions(4, 4, 70, 20)
                        .tooltip(net.minecraft.client.gui.tooltip.Tooltip.of(Text.literal("Mods, Pimpin settings and FPS booster")))
                        .build());
            }
        });
        LOG.info("Pimpin Client ready");
    }

    private static KeyBinding key(String name, int code) {
        return KeyBindingHelper.registerKeyBinding(new KeyBinding("key.pimpin." + name, InputUtil.Type.KEYSYM, code, CATEGORY));
    }

    private void tick(MinecraftClient client) {
        PimpinConfig cfg = PimpinConfig.get();
        while (menuKey.wasPressed()) {
            if (client.currentScreen == null) client.setScreen(new ModMenuScreen(null));
        }
        while (minimapKey.wasPressed()) {
            cfg.minimap = !cfg.minimap;
            PimpinConfig.save();
        }
        while (minimapZoomKey.wasPressed()) {
            cfg.minimapZoom = cfg.minimapZoom >= 4 ? 1 : cfg.minimapZoom * 2;
            Minimap.markDirty();
            PimpinConfig.save();
        }
        while (boostKey.wasPressed()) {
            FpsBooster.toggle(client);
        }
        Zoom.tick(client);
        FpsBooster.tick(client);
        DeathTracker.tick(client);
        Minimap.tick(client);
        PimpinHud.tick(client);
    }

    /** Settings screen, also opened from the mod menu. */
    public static PimpinSettingsScreen settings(net.minecraft.client.gui.screen.Screen parent) {
        return new PimpinSettingsScreen(parent);
    }
}
