package app.folyo.realtime;

import app.folyo.config.FolyoProperties;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * /api/realtime: kimlik ayni oturum cerezi (web) ya da Bearer token (mobil) ile dogrulanir (SecurityConfig).
 * Tarayici her zaman Origin gonderir; yalniz sitenin kendi adresi kabul edilir (baska site adina baglanti acilamaz).
 * Mobil uygulama Origin gondermez ve token'iyla girer.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final RealtimeHandler handler;
    private final List<String> origins;

    public WebSocketConfig(RealtimeHandler handler, FolyoProperties properties,
            @Value("${folyo.cors.allowed-origins:}") List<String> extraOrigins) {
        this.handler = handler;
        List<String> list = new ArrayList<>();
        list.add(properties.webUrl());
        extraOrigins.stream().filter(o -> !o.isBlank()).forEach(list::add);
        this.origins = list;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/api/realtime").setAllowedOrigins(origins.toArray(String[]::new));
    }
}
