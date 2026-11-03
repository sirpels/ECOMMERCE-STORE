import Image from "next/image";
import Link from "next/link";
import styles from "./home-hero.module.css";

// Verified business number in international digits (no + or spaces).
const businessWhatsAppNumber = "2347066814272";
const tailoringMessage = "Hello, I’m interested in having an outfit made. I’d like to ask about tailoring options.";
const tailoringWhatsAppUrl = /^[1-9]\d{7,14}$/.test(businessWhatsAppNumber)
  ? `https://wa.me/${businessWhatsAppNumber}?text=${encodeURIComponent(tailoringMessage)}`
  : null;

export default function HomePage() {
  return (
    <section className={`${styles.hero} relative w-screen left-1/2 -ml-[50vw] overflow-hidden`} aria-labelledby="home-title">
      <div className="relative min-h-[58vh] sm:min-h-[64vh] lg:min-h-[76vh]">
        <Image
          src="/images/hero/editorial-lace-concept.webp"
          alt="Illustrative image of a woman in embroidered lace with a matching headwrap."
          fill
          preload
          sizes="100vw"
          className={`${styles.image} object-cover`}
        />

        <div className={styles.overlay} aria-hidden="true" />

        <div className="relative z-10 mx-auto flex min-h-[58vh] w-full max-w-[72rem] items-end px-4 pb-8 pt-12 sm:min-h-[64vh] sm:px-8 md:px-10 lg:min-h-[76vh] lg:px-12 lg:pb-14">
          <div className="max-w-xl text-white">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/75 sm:text-xs">
              Illustrative editorial fashion
            </p>
            <h1 id="home-title" className="mt-4 max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[clamp(3.2rem,4.6vw,4.6rem)]">
              From Fabric to Finished Elegance.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/85 sm:text-lg sm:leading-8">
              Discover beautiful fabrics and create custom outfits tailored to your style.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/lace" className="inline-flex min-h-12 items-center justify-center rounded-card bg-primary px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90">
                Explore Lace
              </Link>
              {tailoringWhatsAppUrl ? (
                <a
                  href={tailoringWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Have It Made — open a WhatsApp tailoring enquiry in a new tab"
                  className="inline-flex min-h-12 items-center justify-center rounded-card border border-white/30 bg-white/8 px-6 py-3 text-sm font-semibold text-white backdrop-blur-[1px] transition-colors hover:bg-white/15"
                >
                  Have It Made
                </a>
              ) : (
                <button type="button" disabled aria-describedby="tailoring-contact-status" className="inline-flex min-h-12 items-center justify-center rounded-card border border-white/30 bg-white/8 px-6 py-3 text-sm font-semibold text-white/70 disabled:cursor-not-allowed">
                  Have It Made
                </button>
              )}
            </div>

            {!tailoringWhatsAppUrl && (
              <p id="tailoring-contact-status" className="mt-3 max-w-md text-sm leading-6 text-white/80">
                Tailoring enquiries will open when the verified business WhatsApp number is added.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
