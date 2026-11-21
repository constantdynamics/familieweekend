import { describe, expect, it } from "vitest";
import { isGoogleKaartHost, isKorteKaartLink, plekUitLink } from "@/lib/shared/kaartlink";

describe("plekUitLink", () => {
  it("leest de camerapositie uit een Street View-link", () => {
    expect(
      plekUitLink("https://www.google.com/maps/@52.3691253,4.9052171,3a,75y,90h,95t/data=!3m6!1e1!3m4!1sAbc!2e0!7i16384!8i8192"),
    ).toEqual({ lat: 52.369125, lng: 4.905217 });
  });

  it("leest een link van de Maps-URL-API", () => {
    expect(plekUitLink("https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=56.90410,12.49136")).toEqual({
      lat: 56.9041,
      lng: 12.49136,
    });
    expect(plekUitLink("https://maps.google.com/maps?layer=c&cbll=-32.672,152.178&cbp=12,0,0,0,0")).toEqual({
      lat: -32.672,
      lng: 152.178,
    });
    expect(plekUitLink("https://www.google.com/maps/search/?api=1&query=64.1485,-21.942")).toEqual({ lat: 64.1485, lng: -21.942 });
  });

  it("leest een speld uit het datadeel als er geen camerapositie is", () => {
    expect(plekUitLink("https://www.google.com/maps/place/Falconer/data=!4m6!3m5!1s0x0:0x0!8m2!3d42.11898!4d-79.19727")).toEqual({
      lat: 42.11898,
      lng: -79.19727,
    });
  });

  it("neemt de camerapositie boven de speld van een plaats", () => {
    expect(
      plekUitLink("https://www.google.com/maps/place/Valkenswaard/@51.3508,5.4597,3a,75y/data=!3m1!1e3!4m2!3m1!8m2!3d51.35!4d5.46"),
    ).toEqual({ lat: 51.3508, lng: 5.4597 });
  });

  it("leest gekopieerde coördinaten, ook gecodeerd in een link", () => {
    expect(plekUitLink("52.16450, 4.48643")).toEqual({ lat: 52.1645, lng: 4.48643 });
    expect(plekUitLink("https://www.google.com/maps?q=52.1645%2C4.48643")).toEqual({ lat: 52.1645, lng: 4.48643 });
  });

  it("geeft niets bij een korte link, tekst zonder plek of een onmogelijke plek", () => {
    expect(plekUitLink("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
    expect(plekUitLink("Valkenburgerstraat, Amsterdam")).toBeNull();
    expect(plekUitLink("https://www.google.com/maps/@95.1,4.9,15z")).toBeNull();
    expect(plekUitLink("0, 0")).toBeNull();
    expect(plekUitLink("")).toBeNull();
  });
});

describe("korte links en hun hosts", () => {
  it("herkent een korte link uit de Maps-app", () => {
    expect(isKorteKaartLink("https://maps.app.goo.gl/AbCdEf123")).toBe(true);
    expect(isKorteKaartLink("https://goo.gl/maps/AbCdEf123")).toBe(true);
    expect(isKorteKaartLink("https://goo.gl/other")).toBe(false);
    expect(isKorteKaartLink("http://maps.app.goo.gl/AbC")).toBe(false);
    expect(isKorteKaartLink("geen link")).toBe(false);
  });

  it("volgt alleen hosts van Google", () => {
    for (const host of ["maps.app.goo.gl", "consent.google.com", "www.google.com", "www.google.nl", "maps.google.com", "google.co.uk"]) {
      expect(isGoogleKaartHost(host), host).toBe(true);
    }
    for (const host of ["evil.example.com", "google.com.evil.example", "localhost", "169.254.169.254"]) {
      expect(isGoogleKaartHost(host), host).toBe(false);
    }
  });
});
