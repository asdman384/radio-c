import Image from "next/image";
import { RadioPlayer } from "./radio-player";

export default function Home() {
  return (
    <>
      <header className="bg-charcoal">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-center gap-3 px-6 py-4">
          <span className="sr-only">Radio Calico</span>
          <span aria-hidden className="font-heading text-2xl font-bold text-white md:text-3xl">
            Radio
          </span>
          <Image
            src="/RadioCalicoLogoTM.png"
            alt=""
            aria-hidden
            width={96}
            height={96}
            priority
            className="h-11 w-11 md:h-12 md:w-12"
          />
          <span aria-hidden className="font-heading text-2xl font-bold text-mint md:text-3xl">
            Calico
          </span>
        </div>
      </header>

      <RadioPlayer />
    </>
  );
}
