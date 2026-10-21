package dev.pimpin.client.feature;

import dev.pimpin.client.PimpinClient;
import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.DynTex;
import net.minecraft.client.Minecraft;

import java.io.InputStream;
import java.lang.management.ManagementFactory;

/**
 * Pimpin loading screen: our logo instead of Mojang Studios, on the dark background
 * instead of the red one. Used at startup and on every resource reload.
 * Also times how long the game took to reach the title screen.
 */
public final class LoadingScreen {
    private static boolean timed;

    private LoadingScreen() {}

    public static void install() {
        if (!PimpinConfig.get().brandedLoading) return;
        try (InputStream in = LoadingScreen.class.getResourceAsStream("/assets/pimpin/textures/gui/loading.png")) {
            if (in == null) return;
            DynTex.replace("textures/gui/title/mojangstudios.png", in);
            Minecraft mc = Minecraft.getInstance();
            if (mc.options != null && !mc.options.darkMojangStudiosBackground().get()) {
                mc.options.darkMojangStudiosBackground().set(true);
            }
        } catch (Exception e) {
            PimpinClient.LOG.warn("Could not set the Pimpin loading screen", e);
        }
    }

    /** Called when the first menu shows up. */
    public static void gameReady() {
        if (timed) return;
        timed = true;
        long ms = System.currentTimeMillis() - ManagementFactory.getRuntimeMXBean().getStartTime();
        PimpinClient.LOG.info("Game started in {} ms", ms);
        // dev runs: -PdevReload reloads resources once so the loading screen can be checked
        if (Boolean.getBoolean("pimpin.dev.reloadOnTitle")) Minecraft.getInstance().reloadResourcePacks();
    }
}
