package dev.pimpin.client.feature;

import dev.pimpin.client.PimpinConfig;
import net.minecraft.client.Minecraft;


/** A reversible opt-in to vanilla's accessibility toggle, NOT an auto-sprint loop.
 * Never sets player sprinting, movement, or a pressed key. Vanilla remains responsible
 * for hunger, sneaking, item use, swimming, flight and the player's Sprint key.
 */
public final class ToggleSprint {
    private static boolean session;

    private ToggleSprint() {}

    /** Recover a temporary option if an earlier process exited without cleanup. */
    public static void recover(Minecraft client) {
        if (PimpinConfig.get().sprintNativeBackup != null) restore(client);
    }

    public static void tick(Minecraft client) {
        if (!PimpinConfig.get().toggleSprint || client.player == null || client.level == null) {
            restore(client);
            return;
        }
        if (session) return; // Never fight changes made in vanilla's Controls screen.
        // The option survives respawn/travel. Do not reassert a manual override.
        session = true;
        if (!client.options.toggleSprint().get()) {
            // Persist the rollback BEFORE changing an option that vanilla may save.
            PimpinConfig.get().sprintNativeBackup = false;
            PimpinConfig.save();
            client.options.toggleSprint().set(true);
        }
    }

    public static void restore(Minecraft client) {
        Boolean original = PimpinConfig.get().sprintNativeBackup;
        if (original != null) {
            if (client.options.toggleSprint().get()) {
                client.options.toggleSprint().set(original);
                // Now in hold mode: release only the latch created by our temporary mode.
                client.options.keySprint.setDown(false);
                client.options.save();
            }
            PimpinConfig.get().sprintNativeBackup = null;
            PimpinConfig.save();
        }
        session = false;
    }

    public static String indicator(Minecraft client) {
        if (!PimpinConfig.get().toggleSprint) return null;
        if (!client.options.toggleSprint().get()) return "§7Sprint: hold (vanilla override)";
        if (client.player.isSprinting()) return "§aSprint: active (native toggle)";
        return client.options.keySprint.isDown() ? "§eSprint: requested (vanilla rules)" : "§7Sprint: toggle ready";
    }
}
