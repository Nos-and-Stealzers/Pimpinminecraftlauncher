package dev.pimpin.client.feature;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import dev.pimpin.client.PimpinClient;
import dev.pimpin.client.PimpinConfig;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Notices the launcher drops into config/pimpin-notices.json (update ready, mod updates,
 * announcements). The file is only stat'ed every two seconds and parsed when its time or
 * size changes. Every id is shown once ever: shown ids go to config/pimpin-notices-seen.json.
 * Anything odd about either file is rejected without touching what is already queued.
 */
public final class LauncherNotices {
    public static final long SHOW_MILLIS = 7000;
    static final long MAX_BYTES = 64 * 1024;
    static final int MAX_NOTICES = 5;
    static final int TITLE_MAX = 60;
    static final int BODY_MAX = 140;
    static final int SEEN_CAP = 200;
    static final int POLL_TICKS = 40;
    private static final long GAP_MILLIS = 600;
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9._:-]{1,96}");

    public record Notice(String id, String kind, String title, String body, long createdAt) {
        /** launcher-update, mod-updates and announcement get the accent; anything else is neutral. */
        public boolean knownKind() {
            return kind.equals("launcher-update") || kind.equals("mod-updates") || kind.equals("announcement");
        }
    }

    /** Result of reading one notices file: either notices or a reason it was rejected. */
    record Parsed(List<Notice> notices, int skipped, String error) {}

    private static final ArrayDeque<Notice> queue = new ArrayDeque<>();
    private static final LinkedHashSet<String> seen = new LinkedHashSet<>();
    private static final Set<String> logged = new HashSet<>();
    private static boolean seenLoaded;
    private static boolean seenDirty;
    private static Notice current;
    private static long shownMillis;
    private static long gapMillis;
    private static long lastFrameNanos;
    private static long frameRemainder;
    private static long stampTime = Long.MIN_VALUE;
    private static long stampSize = -1;
    private static int pollTimer;
    private static String lastError;

    private LauncherNotices() {}

    static Path file() {
        return FabricLoader.getInstance().getConfigDir().resolve("pimpin-notices.json");
    }

    static Path seenFile() {
        return FabricLoader.getInstance().getConfigDir().resolve("pimpin-notices-seen.json");
    }

    /** Client tick: cheap stat every POLL_TICKS ticks; parse only when the file changed. */
    public static void tick(net.minecraft.client.Minecraft client) {
        if (!PimpinConfig.get().launcherNotices) {
            queue.clear();
            current = null;
            stampTime = Long.MIN_VALUE;
            stampSize = -1;
            pollTimer = 0;
            return;
        }
        if (!dev.pimpin.client.hud.NoticeHud.canShow(client)) frame(false);
        if (seenDirty) saveSeen();
        if (--pollTimer > 0) return;
        pollTimer = POLL_TICKS;
        poll();
    }

    /** Writes pending seen ids (client shutdown). */
    public static void flush() {
        if (seenDirty) saveSeen();
    }

    static void poll() {
        loadSeen();
        Path f = file();
        BasicFileAttributes a;
        try {
            a = Files.readAttributes(f, BasicFileAttributes.class);
        } catch (NoSuchFileException e) {
            stampTime = Long.MIN_VALUE;
            stampSize = -1;
            return;
        } catch (IOException | RuntimeException e) {
            reject("unreadable", e);
            return;
        }
        long time = a.lastModifiedTime().toMillis();
        long size = a.size();
        if (time == stampTime && size == stampSize) return;
        stampTime = time;
        stampSize = size;
        if (!a.isRegularFile()) {
            reject("not a file", null);
            return;
        }
        if (size > MAX_BYTES) {
            reject("too large", null);
            return;
        }
        byte[] data;
        try {
            data = readBounded(f);
        } catch (IOException | RuntimeException e) {
            reject("unreadable", e);
            return;
        }
        if (data == null) {
            reject("too large", null);
            return;
        }
        Parsed parsed = parse(data);
        if (parsed.error() != null) {
            reject(parsed.error(), null);
            return;
        }
        lastError = parsed.skipped() > 0 ? "skipped " + parsed.skipped() + " invalid notices" : null;
        if (lastError != null) logOnce(lastError, null);
        merge(parsed.notices());
    }

    private static byte[] readBounded(Path f) throws IOException {
        try (InputStream in = Files.newInputStream(f)) {
            byte[] data = in.readNBytes((int) MAX_BYTES + 1);
            return data.length > MAX_BYTES ? null : data;
        }
    }

    private static void reject(String reason, Throwable e) {
        lastError = reason;
        logOnce(reason, e);
    }

    private static void logOnce(String reason, Throwable e) {
        if (!logged.add(reason)) return;
        if (e == null) PimpinClient.LOG.warn("Ignoring launcher notices file ({})", reason);
        else PimpinClient.LOG.warn("Ignoring launcher notices file ({}): {}", reason, e.toString());
    }

    /** Strict parse of the launcher's file; bad entries are skipped, a bad document is rejected. */
    static Parsed parse(byte[] data) {
        JsonElement root;
        try {
            JsonReader reader = new JsonReader(new StringReader(new String(data, StandardCharsets.UTF_8)));
            reader.setLenient(false);
            root = new Gson().getAdapter(JsonElement.class).read(reader);
            if (reader.peek() != JsonToken.END_DOCUMENT) return new Parsed(List.of(), 0, "malformed json");
        } catch (Exception e) {
            return new Parsed(List.of(), 0, "malformed json");
        }
        if (root == null || !root.isJsonObject()) return new Parsed(List.of(), 0, "not an object");
        JsonObject obj = root.getAsJsonObject();
        JsonElement version = obj.get("version");
        if (!(version instanceof JsonPrimitive vp) || !vp.isNumber() || vp.getAsDouble() != 1) {
            return new Parsed(List.of(), 0, "unsupported version");
        }
        JsonElement list = obj.get("notices");
        if (list == null || !list.isJsonArray()) return new Parsed(List.of(), 0, "missing notices");
        JsonArray array = list.getAsJsonArray();
        Map<String, Notice> byId = new LinkedHashMap<>();
        int skipped = 0;
        for (JsonElement e : array) {
            Notice n = notice(e);
            if (n == null) {
                skipped++;
                continue;
            }
            Notice old = byId.get(n.id());
            if (old == null || n.createdAt() > old.createdAt()) byId.put(n.id(), n);
        }
        List<Notice> out = new ArrayList<>(byId.values());
        out.sort(Comparator.comparingLong(Notice::createdAt).reversed());
        if (out.size() > MAX_NOTICES) out = new ArrayList<>(out.subList(0, MAX_NOTICES));
        return new Parsed(List.copyOf(out), skipped, null);
    }

    private static Notice notice(JsonElement e) {
        if (e == null || !e.isJsonObject()) return null;
        JsonObject o = e.getAsJsonObject();
        String id = string(o, "id", false);
        String title = string(o, "title", false);
        String body = string(o, "body", false);
        String kind = string(o, "kind", false);
        JsonElement created = o.get("createdAt");
        if (id == null || title == null || body == null || kind == null) return null;
        if (!ID.matcher(id).matches()) return null;
        if (!(created instanceof JsonPrimitive cp) || !cp.isNumber()) return null;
        double at = cp.getAsDouble();
        if (!Double.isFinite(at) || at < 0 || at > 1e15 || at != Math.rint(at)) return null;
        title = truncate(clean(title), TITLE_MAX);
        body = truncate(clean(body), BODY_MAX);
        if (title.isEmpty()) return null;
        return new Notice(id, kind.trim(), title, body, (long) at);
    }

    /** A string field, "" when optional and absent, null when wrong type or required and absent. */
    private static String string(JsonObject o, String key, boolean optional) {
        JsonElement v = o.get(key);
        if (v == null || v.isJsonNull()) return optional ? "" : null;
        if (!(v instanceof JsonPrimitive p) || !p.isString()) return null;
        return p.getAsString();
    }

    /** Drops formatting codes and control characters and collapses whitespace. */
    static String clean(String s) {
        StringBuilder b = new StringBuilder(Math.min(s.length(), 512));
        boolean space = false;
        for (int i = 0; i < s.length() && b.length() < 512; i++) {
            char c = s.charAt(i);
            if (c == '\u00a7') {
                i++;
                continue;
            }
            if (Character.isWhitespace(c) || Character.isISOControl(c) || c == '\u2028' || c == '\u2029') {
                space = b.length() > 0;
                continue;
            }
            if (space) b.append(' ');
            space = false;
            b.append(c);
        }
        return b.toString();
    }

    static String truncate(String s, int max) {
        if (s.codePointCount(0, s.length()) <= max) return s;
        String cut = s.substring(0, s.offsetByCodePoints(0, max - 3)).stripTrailing();
        return cut + "...";
    }

    private static void merge(List<Notice> notices) {
        List<Notice> fresh = new ArrayList<>();
        for (Notice n : notices) {
            if (seen.contains(n.id())) continue;
            if (current != null && current.id().equals(n.id())) continue;
            fresh.add(n);
        }
        fresh.sort(Comparator.comparingLong(Notice::createdAt));
        queue.clear();
        queue.addAll(fresh);
    }

    /**
     * Called every HUD frame. Time only runs while the panel can actually be seen, so a
     * notice is never used up behind F1, a menu or the title screen. Returns what to draw.
     */
    public static Notice frame(boolean visible) {
        long now = System.nanoTime();
        long elapsed = lastFrameNanos == 0 ? 0 : now - lastFrameNanos + frameRemainder;
        long dt = elapsed / 1_000_000L;
        frameRemainder = elapsed % 1_000_000L;
        lastFrameNanos = visible ? now : 0;
        if (!visible) return null;
        if (dt < 0 || dt > 250) dt = 0;
        if (current == null) {
            if (gapMillis > 0) {
                gapMillis -= dt;
                return null;
            }
            current = queue.poll();
            if (current == null) return null;
            shownMillis = 0;
            markSeen(current.id());
            return current;
        }
        shownMillis += dt;
        if (shownMillis >= SHOW_MILLIS) {
            current = null;
            gapMillis = GAP_MILLIS;
            return null;
        }
        return current;
    }

    public static long shownMillis() {
        return shownMillis;
    }

    private static void markSeen(String id) {
        loadSeen();
        seen.remove(id);
        seen.add(id);
        trimSeen();
        seenDirty = true;
    }

    private static void trimSeen() {
        Iterator<String> it = seen.iterator();
        while (seen.size() > SEEN_CAP && it.hasNext()) {
            it.next();
            it.remove();
        }
    }

    private static void loadSeen() {
        if (seenLoaded) return;
        seenLoaded = true;
        seen.clear();
        Path f = seenFile();
        try {
            if (!Files.isRegularFile(f)) return;
            if (Files.size(f) > MAX_BYTES) {
                logOnce("seen file too large", null);
                return;
            }
            byte[] data = readBounded(f);
            if (data == null) return;
            JsonReader reader = new JsonReader(new StringReader(new String(data, StandardCharsets.UTF_8)));
            reader.setLenient(false);
            JsonElement root = new Gson().getAdapter(JsonElement.class).read(reader);
            JsonElement ids = root != null && root.isJsonObject() ? root.getAsJsonObject().get("seen") : null;
            if (ids == null || !ids.isJsonArray()) {
                logOnce("seen file malformed", null);
                return;
            }
            for (JsonElement e : ids.getAsJsonArray()) {
                if (e instanceof JsonPrimitive p && p.isString() && ID.matcher(p.getAsString()).matches()) {
                    seen.remove(p.getAsString());
                    seen.add(p.getAsString());
                }
            }
            trimSeen();
        } catch (Exception e) {
            seen.clear();
            logOnce("seen file malformed", e);
        }
    }

    private static void saveSeen() {
        seenDirty = false;
        Path f = seenFile();
        Path tmp = f.resolveSibling(f.getFileName() + ".tmp");
        try {
            Files.createDirectories(f.getParent());
            JsonObject root = new JsonObject();
            root.addProperty("version", 1);
            JsonArray ids = new JsonArray();
            for (String id : seen) ids.add(id);
            root.add("seen", ids);
            try (Writer w = Files.newBufferedWriter(tmp, StandardCharsets.UTF_8)) {
                new Gson().toJson(root, w);
            }
            try {
                Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException | RuntimeException e) {
            logOnce("could not save seen notices", e);
        }
    }

}
