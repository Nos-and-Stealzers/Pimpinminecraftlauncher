package dev.pimpin.client.feature;

import dev.pimpin.client.PimpinClient;
import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.hud.NoticeHud;
import dev.pimpin.client.screen.PimpinSettingsScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Collection;
import java.util.List;

/** Only compiled/injected by -PnoticeTest. Uses a named disposable mod/run fixture. */
public final class LauncherNoticesDevTest implements ClientModInitializer {
    private static int ticks, checks;
    private static boolean started;
    private static long began;
    private static String sample(String id, String title, String body, long time) {
        return "{\"id\":\""+id+"\",\"kind\":\"launcher-update\",\"title\":\""+title+"\",\"body\":\""+body+"\",\"createdAt\":"+time+"}";
    }
    private static String document(String... notices) {return "{\"version\":1,\"notices\":["+String.join(",",notices)+"]}";}
    private static Field field(String name) throws Exception {var f=LauncherNotices.class.getDeclaredField(name);f.setAccessible(true);return f;}
    private static Object value(String name) throws Exception {return field(name).get(null);}
    private static void set(String name,Object value) throws Exception {field(name).set(null,value);}
    private static int size(String name) throws Exception {return ((Collection<?>)value(name)).size();}
    private static void check(boolean ok,String message) {
        if(!ok) throw new IllegalStateException("NOTICE_TEST FAILED: "+message);
        checks++;PimpinClient.LOG.info("NOTICE_TEST PASS: {}",message);
    }
    private static void write(String text) throws Exception {Files.writeString(LauncherNotices.file(),text);forcePoll();}
    private static void forcePoll() throws Exception {set("stampTime",Long.MIN_VALUE);LauncherNotices.poll();}
    private static void reset() throws Exception {
        LauncherNotices.flush();((Collection<?>)value("queue")).clear();((Collection<?>)value("seen")).clear();
        set("seenLoaded",false);set("current",null);set("shownMillis",0L);set("gapMillis",0L);set("lastFrameNanos",0L);
        set("stampTime",Long.MIN_VALUE);set("stampSize",-1L);
    }
    @Override public void onInitializeClient() {
        if(!FabricLoader.getInstance().isDevelopmentEnvironment() || !Boolean.getBoolean("pimpin.dev.noticeTest"))return;
        ClientTickEvents.END_CLIENT_TICK.register(LauncherNoticesDevTest::tick);
    }
    private static void tests(Minecraft mc) throws Exception {
        String a=sample("test-ready","Pimpin Launcher 0.1.27 is ready","It installs when you close the launcher.",10);
        check(PimpinConfig.get().launcherNotices,"notices on by default");
        write(document(a));
        check(size("queue")==1,"sample file parsed into queue");
        check(LauncherNotices.frame(false)==null && size("seen")==0,"hidden/title state queues without consuming");
        check(LauncherNotices.parse("{broken".getBytes(StandardCharsets.UTF_8)).error()!=null,"malformed JSON rejected");
        check(LauncherNotices.parse("{\"version\":2,\"notices\":[]}".getBytes(StandardCharsets.UTF_8)).error()!=null,"unknown version rejected");
        check(LauncherNotices.parse("{\"version\":1,\"notices\":[]} junk".getBytes(StandardCharsets.UTF_8)).error()!=null,"trailing garbage rejected");
        check(LauncherNotices.parse("{version:1,notices:[]}".getBytes(StandardCharsets.UTF_8)).error()!=null,"unquoted JSON rejected");
        var bad=LauncherNotices.parse(document("{\"id\":4}",a).getBytes(StandardCharsets.UTF_8));
        check(bad.skipped()==1 && bad.notices().size()==1,"bad entry ignored without losing good notices");
        String[] many=new String[8];for(int i=0;i<8;i++)many[i]=sample("test-"+i,"Notice "+i,"Body",i);
        var latest=LauncherNotices.parse(document(many).getBytes(StandardCharsets.UTF_8));
        check(latest.notices().size()==5 && latest.notices().get(0).createdAt()==7 && latest.notices().get(4).createdAt()==3,"only five newest retained");
        var longN=LauncherNotices.parse(document(sample("long","T".repeat(100),"B".repeat(200),1)).getBytes(StandardCharsets.UTF_8)).notices().get(0);
        check(longN.title().length()==60 && longN.body().length()==140,"title/body limits enforced");
        check(LauncherNotices.clean("Hello \\n").startsWith("Hello"),"plain text sanitization");
        check(!new LauncherNotices.Notice("u","future-kind","Title","Body",1).knownKind(),"unknown kinds neutral and displayable");
        write("{"+" ".repeat(65536)+"}");check("too large".equals(value("lastError")) && size("queue")==1,"oversized file rejected preserving queue");
        write("{oops");check("malformed json".equals(value("lastError")) && size("queue")==1,"malformed file rejected preserving queue");
        write(document(a));LauncherNotices.frame(true);
        check(value("current")!=null && size("seen")==1,"one panel starts and id marked seen");
        LauncherNotices.flush();check(Files.readString(LauncherNotices.seenFile()).contains("test-ready"),"seen file persisted");
        reset();forcePoll();check(size("queue")==0,"restart reload does not show a seen id twice");
        @SuppressWarnings("unchecked") var seen=(java.util.Set<String>)value("seen");
        for(int i=0;i<205;i++){var m=LauncherNotices.class.getDeclaredMethod("markSeen",String.class);m.setAccessible(true);m.invoke(null,"cap-"+i);}
        LauncherNotices.flush();check(seen.size()==200 && !seen.contains("cap-0") && seen.contains("cap-204"),"seen ids capped at 200 newest");
        reset();forcePoll();check(size("seen")==200,"seen cap persists across restart");
        // Fresh visual sample, using the real HUD callback (not a preview renderer).
        write(document(sample("visual","Pimpin Launcher 0.1.27 is ready","It installs when you close the launcher.",100)));
        Compat.setScreen(mc,null);began=System.nanoTime();
    }
    private static void settings(Minecraft mc) throws Exception {
        var f=PimpinSettingsScreen.class.getDeclaredField("tab");f.setAccessible(true);f.setInt(null,4);
        var s=new PimpinSettingsScreen(null);Compat.setScreen(mc,s);
        boolean found=false;
        for(var child:s.children()) if(child instanceof Button b && b.getMessage().getString().startsWith("Launcher notices:")) {
            found=true;Compat.press(b);check(!PimpinConfig.get().launcherNotices,"actual QoL toggle disables notices");
            Compat.press(b);check(PimpinConfig.get().launcherNotices,"actual QoL toggle enables notices");
        }
        check(found,"Launcher notices row present");
        for(int[] vp:new int[][]{{320,180},{426,240},{640,360}}) {
            Compat.resizeScreen(s,mc,vp[0],vp[1]);boolean fits=true;
            for(var child:s.children())if(child instanceof AbstractWidget w)fits &= w.getX()>=0 && w.getY()>=0 && w.getX()+w.getWidth()<=vp[0] && w.getY()+w.getHeight()<=vp[1];
            check(fits,"paginated QoL widgets fit "+vp[0]+"x"+vp[1]);
        }
        resize(mc);Compat.setScreen(mc,null);
    }
    private static void resize(Minecraft mc) {
        try {
            //#if MC >= 26.1
            mc.getClass().getMethod("resizeGui").invoke(mc);
            //#else
            mc.resizeDisplay();
            //#endif
        } catch (ReflectiveOperationException e) { throw new RuntimeException(e); }
    }
    private static void tick(Minecraft mc) {
        if(!started) {
            if(mc.player==null || mc.getSingleplayerServer()==null)return;
            var dir=mc.gameDirectory.toPath().toAbsolutePath().normalize();
            if(!dir.getFileName().toString().startsWith("notice-test-") || !dir.getParent().endsWith("run") || !dir.getParent().getParent().endsWith("mod"))return;
            started=true;
        }
        try {
            switch(++ticks) {
                case 20 -> tests(mc);
                case 45 -> {
                    check(value("current")!=null && size("queue")==0,"real HUD callback has one active panel");
                    var n=(LauncherNotices.Notice)value("current");int[] b=NoticeHud.bounds(mc,n,mc.getWindow().getGuiScaledWidth(),mc.getWindow().getGuiScaledHeight());
                    check(b[0]>=4 && b[1]>=36 && b[0]+b[2]<=mc.getWindow().getGuiScaledWidth()-4 && b[1]+b[3]<=mc.getWindow().getGuiScaledHeight()-4,"panel fits viewport below vanilla toast slot");
                    shot(mc,"notice-panel");
                }
                case 55 -> {mc.options.guiScale().set(4);resize(mc);}
                case 70 -> shot(mc,"notice-panel-compact");
                case 80 -> {mc.options.guiScale().set(2);resize(mc);}
                case 90 -> settings(mc);
                case 100 -> {
                    // Fast forward only the clock to verify expiry without a slow/flaky real-time wait.
                    set("shownMillis",LauncherNotices.SHOW_MILLIS);LauncherNotices.frame(true);
                    check(value("current")==null,"panel expires after seven visible seconds");
                    forcePoll();check(size("queue")==0,"unchanged notice never requeues");
                    write(document(sample("next","Mods are up to date","Your instance is ready to play.",101)));
                    set("gapMillis",0L);
                }
                case 125 -> {check(value("current")!=null,"next queued notice shown after first");shot(mc,"notice-next");}
                case 140 -> {LauncherNotices.flush();dev.pimpin.client.compat.NoticeTestCapture.disconnect(mc);}
                case 155 -> {check(mc.player==null && !NoticeHud.canShow(mc),"disconnect/title hides notices");PimpinClient.LOG.info("NOTICE_TEST COMPLETE: {} assertions",checks);mc.stop();}
            }
        } catch(Exception e) {PimpinClient.LOG.error("NOTICE_TEST FAILED",e);mc.stop();}
    }
    private static void shot(Minecraft mc,String name) {
        dev.pimpin.client.compat.NoticeTestCapture.shot(mc,name);
    }
}
