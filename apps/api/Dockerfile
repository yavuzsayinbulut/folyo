# syntax=docker/dockerfile:1
# Derleme: Maven bagimliliklari ayri katmanda onbelleklenir; kaynak degisince yalniz son katman yeniden derlenir.
FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -q -B dependency:go-offline
COPY src src
RUN ./mvnw -q -B -DskipTests package && cp target/api-*.jar /src/app.jar

# Calisma: yalniz JRE, root olmayan kullanici, foto dizini kalici volume icin hazir.
# ffmpeg videolari yeniden kodlamadan (kalite kaybi olmadan) paketler, meta veriyi siler ve kapak karesi cikarir.
FROM eclipse-temurin:25-jre
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/* \
    && groupadd -r folyo && useradd -r -g folyo -u 10001 folyo \
    && mkdir -p /data/media && chown -R folyo:folyo /data
WORKDIR /app
COPY --from=build /src/app.jar app.jar
USER folyo
ENV SPRING_PROFILES_ACTIVE=prod \
    FOLYO_MEDIA_DIR=/data/media \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
