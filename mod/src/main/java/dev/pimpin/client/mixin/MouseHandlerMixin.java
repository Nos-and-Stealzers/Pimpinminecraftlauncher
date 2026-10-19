package dev.pimpin.client.mixin;

import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.feature.Zoom;
import dev.pimpin.client.hud.Minimap;
import dev.pimpin.client.hud.PimpinHud;
import net.minecraft.client.Minecraft;
import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#if MC >= 1.21.9
import net.minecraft.client.input.MouseButtonInfo;
//#endif

@Mixin(MouseHandler.class)
public abstract class MouseHandlerMixin {
    @Inject(method = "onScroll", at = @At("HEAD"), cancellable = true)
    private void pimpin$scrollZoom(long window, double horizontal, double vertical, CallbackInfo ci) {
        if (Compat.screen(Minecraft.getInstance()) == null && vertical != 0 && (Zoom.onScroll(vertical) || Minimap.onScroll(vertical))) ci.cancel();
    }

    //#if MC >= 1.21.9
    @Inject(method = "onButton", at = @At("HEAD"))
    private void pimpin$countClicks(long window, MouseButtonInfo info, int action, CallbackInfo ci) {
        if (action == 1 && Compat.screen(Minecraft.getInstance()) == null) PimpinHud.click(info.button());
    }
    //#else
    @Inject(method = "onPress", at = @At("HEAD"))
    private void pimpin$countClicks(long window, int button, int action, int mods, CallbackInfo ci) {
        if (action == 1 && Compat.screen(Minecraft.getInstance()) == null) PimpinHud.click(button);
    }
    //#endif
}
