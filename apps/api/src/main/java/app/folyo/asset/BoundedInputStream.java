package app.folyo.asset;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;

/** Alttaki akistan en fazla limit bayt okur (aralikli video yaniti icin). */
final class BoundedInputStream extends FilterInputStream {

    private long remaining;

    BoundedInputStream(InputStream in, long limit) {
        super(in);
        this.remaining = limit;
    }

    @Override
    public int read() throws IOException {
        if (remaining <= 0) {
            return -1;
        }
        int b = super.read();
        if (b >= 0) {
            remaining--;
        }
        return b;
    }

    @Override
    public int read(byte[] buffer, int off, int len) throws IOException {
        if (remaining <= 0) {
            return -1;
        }
        int n = super.read(buffer, off, (int) Math.min(len, remaining));
        if (n > 0) {
            remaining -= n;
        }
        return n;
    }
}
