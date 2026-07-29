import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Consultorio from "@/components/Consultorio";
import Manifesto from "@/components/Manifesto";
import Treatments from "@/components/Treatments";
import Cta from "@/components/Cta";
import Team from "@/components/Team";
import Testimonials from "@/components/Testimonials";
import Faq from "@/components/Faq";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Consultorio />
        <Manifesto />
        <Treatments />
        <Cta />
        <Team />
        <Testimonials />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
