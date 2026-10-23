package dev.pimpin.client.compat;

import java.util.function.Consumer;
//#if MC >= 1.21.6
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
//#else
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
//#endif

/** Hooks a HUD renderer into the game; the Fabric API for this changed in 1.21.6. */
public final class Hud {
    private Hud() {}

    public static void register(Consumer<Draw> renderer) {
        register("hud", renderer);
    }

    /** Each layer needs its own id on 1.21.6+; later registrations draw on top. */
    public static void register(String id, Consumer<Draw> renderer) {
        //#if MC >= 1.21.11
        HudElementRegistry.addLast(net.minecraft.resources.Identifier.fromNamespaceAndPath("pimpin", id), (graphics, tickCounter) -> renderer.accept(new Draw(graphics)));
        //#elseif MC >= 1.21.6
        HudElementRegistry.addLast(net.minecraft.resources.ResourceLocation.fromNamespaceAndPath("pimpin", id), (graphics, tickCounter) -> renderer.accept(new Draw(graphics)));
        //#else
        // Mark the registration so the legacy wrapper leaves Pimpin's own HUDs alone.
        dev.pimpin.client.hud.ForeignHuds.setOwnRegistering(true);
        try {
            HudRenderCallback.EVENT.register((graphics, tickDelta) -> renderer.accept(new Draw(graphics)));
        } finally {
            dev.pimpin.client.hud.ForeignHuds.setOwnRegistering(false);
        }
        //#endif
    }
}
