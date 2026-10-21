package dev.pimpin.client.mixin;

import dev.pimpin.client.feature.LoadingScreen;
import net.minecraft.client.gui.screens.LoadingOverlay;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Swaps the Mojang Studios logo on the loading screen right after the game registers it. */
@Mixin(LoadingOverlay.class)
public abstract class LoadingOverlayMixin {
    @Inject(method = "registerTextures", at = @At("TAIL"))
    private static void pimpin$logo(CallbackInfo ci) {
        LoadingScreen.install();
    }
}
