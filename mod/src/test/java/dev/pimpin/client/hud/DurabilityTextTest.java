package dev.pimpin.client.hud;

/** Dependency-free executable regression tests; no Minecraft installation touched. */
public final class DurabilityTextTest {
    private static int checks;
    private static Object call(String name, Class<?>[] types, Object... args) throws Exception {
        Class<?> type;
        try { type = Class.forName("dev.pimpin.client.hud.DurabilityText"); }
        catch (ClassNotFoundException e) { throw new AssertionError("Selectable durability readouts are not implemented", e); }
        return type.getMethod(name, types).invoke(null, args);
    }
    private static void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); checks++; }
    public static void main(String[] args) throws Exception {
        var signature = new Class<?>[]{int.class, int.class, int.class};
        check(call("format", signature, 100, 15, 0).equals("85"), "remaining mode");
        check(call("format", signature, 100, 15, 1).equals("85%"), "percent mode");
        check(call("format", signature, 100, 15, 2).equals("85 (85%)"), "both mode");
        check(call("format", signature, 3, 2, 1).equals("33%"), "floor fractional percentages");
        check(call("format", signature, 100, 999, 2).equals("0 (0%)"), "overdamage clamps to zero");
        check(call("format", signature, 100, -5, 1).equals("100%"), "negative damage clamps");
        check(call("format", signature, 0, 0, 2).equals(""), "non-damageable has no readout");
        check(call("format", signature, 100, 1, 99).equals("99"), "invalid mode falls back to remaining");
        check(!(boolean)call("low", signature, 100, 90, 0), "warning off");
        check((boolean)call("low", signature, 100, 90, 10), "warning includes exact threshold");
        check(!(boolean)call("low", signature, 1000, 899, 10), "warning compares exact fraction, not floored percentage");
        check(!(boolean)call("low", signature, 0, 0, 10), "no warning on nondamageable");
        check((boolean)call("low", signature, Integer.MAX_VALUE, Integer.MAX_VALUE - 1, 5), "threshold avoids integer overflow");
        System.out.println("PASS " + checks + " durability regression assertions");
    }
}
