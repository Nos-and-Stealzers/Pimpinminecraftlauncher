package dev.pimpin.client.feature;

import dev.pimpin.client.PimpinClient;
import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.hud.EffectsHud;
import dev.pimpin.client.screen.PimpinSettingsScreen;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.level.storage.LevelResource;

/** Explicit dev-only integration fixture. Never runs in release or arbitrary worlds.
 * Exercises actual server-synchronized effects and native option lifecycle; it does
 * not claim OS keyboard interaction coverage. All mutations stay in PimpinQolTest.
 */
public final class ClientQolDevTest {
    private static final boolean ENABLED = FabricLoader.getInstance().isDevelopmentEnvironment()
            && Boolean.getBoolean("pimpin.dev.clientQolTest");
    private static int ticks;
    private static boolean initialSprint;

    private ClientQolDevTest() {}

    private static void check(boolean condition, String message) {
        if (!condition) throw new IllegalStateException("CLIENT_QOL_TEST FAILED: " + message);
        PimpinClient.LOG.info("CLIENT_QOL_TEST PASS: {}", message);
    }

    public static void tick(Minecraft client) {
        if (!ENABLED || client.player == null || client.level == null || client.getSingleplayerServer() == null) return;
        var server = client.getSingleplayerServer();
        var directory = client.gameDirectory.toPath().toAbsolutePath().normalize();
        if (!directory.getParent().endsWith("run") || !directory.getParent().getParent().endsWith("mod")) return;
        if (!server.getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize().endsWith("PimpinQolTest")) return;
        var cfg = PimpinConfig.get();
        var id = client.player.getUUID();
        switch (++ticks) {
            case 20 -> {
                check(!cfg.toggleSprint && !cfg.effectHud, "both features default OFF");
                initialSprint = client.options.toggleSprint().get();
                cfg.toggleSprint = true;
                cfg.effectHud = true;
                ToggleSprint.tick(client);
                check(client.options.toggleSprint().get(), "native toggle enabled without setting sprint or movement");
                server.execute(() -> {
                    var player = server.getPlayerList().getPlayer(id);
                    if (player == null) return;
                    player.removeAllEffects();
                    player.addEffect(new MobEffectInstance(MobEffects.REGENERATION, 1200, 1, false, false));
                    player.addEffect(new MobEffectInstance(MobEffects.WEAKNESS, 140, 2, false, false));
                    player.addEffect(new MobEffectInstance(MobEffects.GLOWING, -1, 0, false, false));
                });
            }
            case 80 -> {
                var lines = EffectsHud.lines(client, 240, 12);
                check(lines.size() == 3, "three synchronized effects: " + lines);
                check(lines.stream().anyMatch(s -> s.contains("Infinite")), "infinite duration explicitly labeled");
                check(EffectsHud.lines(client, 240, 1).size() == 1 && EffectsHud.lines(client, 240, 1).get(0).contains("+3 more"), "overflow is counted, not drawn off screen");
                check(EffectsHud.lines(client, 240, 0).isEmpty(), "no rows when viewport has no room");
                shot(client, "client-qol-effects");
            }
            case 220 -> {
                var lines = EffectsHud.lines(client, 240, 12);
                check(lines.size() == 2, "short effect expired, no stale timer: " + lines);
                shot(client, "client-qol-expired");
            }
            case 240 -> cfg.effectHud = false;
            case 260 -> {
                check(EffectsHud.lines(client, 240, 12).isEmpty(), "effects HUD disabled");
                shot(client, "client-qol-off");
            }
            case 280 -> {
                cfg.effectHud = true;
                server.execute(() -> {
                    var player = server.getPlayerList().getPlayer(id);
                    if (player != null) player.removeAllEffects();
                });
            }
            case 320 -> {
                check(EffectsHud.lines(client, 240, 12).isEmpty(), "removed effects disappear");
                cfg.toggleSprint = false;
                ToggleSprint.tick(client);
                check(client.options.toggleSprint().get() == initialSprint && cfg.sprintNativeBackup == null, "previous native sprint mode restored");
                // Respect a player changing native Controls while our feature is enabled.
                cfg.toggleSprint = true;
                ToggleSprint.tick(client);
                client.options.toggleSprint().set(false);
                ToggleSprint.tick(client);
                check(!client.options.toggleSprint().get(), "vanilla Controls override respected");
                cfg.toggleSprint = false;
                ToggleSprint.restore(client);
                client.options.toggleSprint().set(initialSprint);
                check(cfg.sprintNativeBackup == null, "rollback cleared after override");
                client.options.toggleSprint().set(true);
                cfg.toggleSprint = true;
                ToggleSprint.tick(client);
                cfg.toggleSprint = false;
                ToggleSprint.restore(client);
                check(client.options.toggleSprint().get(), "pre-existing native toggle preserved");
                cfg.sprintNativeBackup = false;
                ToggleSprint.recover(client);
                check(!client.options.toggleSprint().get() && cfg.sprintNativeBackup == null, "crash rollback recovery restores original hold mode");
                client.options.toggleSprint().set(initialSprint);
            }
            // Capture after a rendered frame, not the state-changing tick's old framebuffer.
            case 330 -> shot(client, "client-qol-cleared");
            case 340 -> {
                try {
                    var tab = PimpinSettingsScreen.class.getDeclaredField("tab");
                    tab.setAccessible(true);
                    tab.setInt(null, 4);
                } catch (ReflectiveOperationException e) { throw new IllegalStateException(e); }
                Compat.setScreen(client, new PimpinSettingsScreen(null));
            }
            case 360 -> shot(client, "client-qol-settings");
            case 380 -> {
                cfg.toggleSprint = true;
                ToggleSprint.tick(client);
            }
            case 400 -> {
                PimpinConfig.save();
                PimpinClient.LOG.info("CLIENT_QOL_TEST COMPLETE (fixture automation, not physical keyboard input)");
                client.stop();
            }
        }
    }

    public static void stopping(Minecraft client) {
        if (ENABLED && ticks > 0) {
            check(client.options.toggleSprint().get() == initialSprint && PimpinConfig.get().sprintNativeBackup == null,
                    "shutdown restores previous native mode and clears rollback");
        }
    }

    private static void shot(Minecraft client, String name) {
        //#if MC >= 26.2
        Screenshot.grab(client.gameDirectory, name + ".png", client.gameRenderer.mainRenderTarget(), 1,
                message -> PimpinClient.LOG.info("CLIENT_QOL_SCREENSHOT {}: {}", name, message.getString()));
        //#elseif MC >= 1.21.6
        Screenshot.grab(client.gameDirectory, name + ".png", client.getMainRenderTarget(), 1,
                message -> PimpinClient.LOG.info("CLIENT_QOL_SCREENSHOT {}: {}", name, message.getString()));
        //#else
        Screenshot.grab(client.gameDirectory, name + ".png", client.getMainRenderTarget(),
                message -> PimpinClient.LOG.info("CLIENT_QOL_SCREENSHOT {}: {}", name, message.getString()));
        //#endif
    }
}
