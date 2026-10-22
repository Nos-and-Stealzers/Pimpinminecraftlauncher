package dev.pimpin.client.compat;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import dev.pimpin.client.PimpinClient;
/** Test-only screenshot compatibility; never included in production. */
public final class NoticeTestCapture {
    public static void disconnect(Minecraft mc) {
        //#if MC >= 1.21.11
        mc.level.disconnect(net.minecraft.network.chat.Component.literal("notice-test"));
        //#else
        mc.level.disconnect();
        //#endif
        //#if MC >= 1.21.6
        mc.disconnectWithSavingScreen();
        //#elseif MC >= 1.20.2
        mc.disconnect();
        //#else
        mc.clearLevel();
        //#endif
    }
    public static void shot(Minecraft mc,String name) {
        //#if MC >= 26.2
        Screenshot.grab(mc.gameDirectory,name+".png",mc.gameRenderer.mainRenderTarget(),1,m->PimpinClient.LOG.info("NOTICE_SCREENSHOT {}",name));
        //#elseif MC >= 1.21.6
        Screenshot.grab(mc.gameDirectory,name+".png",mc.getMainRenderTarget(),1,m->PimpinClient.LOG.info("NOTICE_SCREENSHOT {}",name));
        //#else
        Screenshot.grab(mc.gameDirectory,name+".png",mc.getMainRenderTarget(),m->PimpinClient.LOG.info("NOTICE_SCREENSHOT {}",name));
        //#endif
    }
}
