import { motion } from "framer-motion";
import { Copyright } from "lucide-react";
import { Layout } from "@/components/Layout";

const LAST_UPDATED = "17 August 2026";
const CONTACT_EMAIL = "support@oxygenlow.com";
const DMCA_EMAIL = "dmca@oxygenlow.com";
const OPERATOR = "Oxygen Low's Software";
const SITE_URL = "https://oxygenlow.com";

interface SectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
  index: number;
}

function Section({ id, title, children, index }: SectionProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: "easeOut" }}
      className="space-y-3"
    >
      <h2 className="text-xl font-bold tracking-tight border-b border-border/40 pb-2">
        {title}
      </h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
        {children}
      </div>
    </motion.section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc list-inside space-y-1 pl-2">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function Dmca() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto w-full px-2 py-6 space-y-10 pb-20">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex items-start gap-4"
        >
          <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 shadow-inner shrink-0">
            <Copyright className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              DMCA & Copyright Policy
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Last updated: {LAST_UPDATED} &nbsp;·&nbsp; Operated by{" "}
              <span className="font-medium text-foreground">{OPERATOR}</span>
              &nbsp;·&nbsp; United Kingdom
            </p>
          </div>
        </motion.div>

        {/* 1. Overview */}
        <Section id="overview" title="1. Overview" index={1}>
          <P>
            <strong>{OPERATOR}</strong> ("we", "us", or "our") respects the
            intellectual property rights of others and expects users of our
            Service (available at{" "}
            <a
              href={SITE_URL}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              target="_blank"
              rel="noopener noreferrer"
            >
              {SITE_URL}
            </a>
            ) to do the same. We comply with the Digital Millennium Copyright
            Act of 1998 ("DMCA") and, to the extent applicable, the Copyright,
            Designs and Patents Act 1988 (UK) and the EU Copyright Directive.
          </P>
          <P>
            This policy explains how copyright owners can submit a notice of
            alleged infringement, how users can submit a counter-notice, and how
            we handle repeat infringers.
          </P>
        </Section>

        {/* 2. Reporting Infringement */}
        <Section
          id="reporting"
          title="2. Reporting Copyright Infringement"
          index={2}
        >
          <P>
            If you believe that content available through our Service infringes
            your copyright or the copyright of someone you are authorised to act
            on behalf of, you may submit a written DMCA takedown notice to our
            designated Copyright Agent. Your notice must include all of the
            following elements required under 17 U.S.C. § 512(c)(3):
          </P>
          <Ul
            items={[
              <>
                <strong>Identification of the copyrighted work</strong> — A
                description of the copyrighted work you claim has been infringed,
                or, if multiple works are covered, a representative list of such
                works.
              </>,
              <>
                <strong>Identification of the infringing material</strong> — A
                description of the material that you claim is infringing and that
                you request be removed, with sufficient information (e.g. a
                specific URL) to allow us to locate it.
              </>,
              <>
                <strong>Contact information</strong> — Your name, postal
                address, telephone number, and email address.
              </>,
              <>
                <strong>Good faith statement</strong> — A statement that you
                have a good faith belief that the use of the material in the
                manner complained of is not authorised by the copyright owner,
                its agent, or the law.
              </>,
              <>
                <strong>Accuracy statement</strong> — A statement, made under
                penalty of perjury, that the information in your notice is
                accurate and that you are the copyright owner or authorised to
                act on the copyright owner's behalf.
              </>,
              <>
                <strong>Signature</strong> — A physical or electronic signature
                of the copyright owner or a person authorised to act on their
                behalf.
              </>,
            ]}
          />
          <P>
            Please be aware that submitting a false or bad-faith DMCA notice may
            expose you to liability, including for damages, costs, and legal
            fees.
          </P>
        </Section>

        {/* 3. Where to send */}
        <Section
          id="designated-agent"
          title="3. Designated Copyright Agent"
          index={3}
        >
          <P>
            Send your completed DMCA takedown notice to our designated Copyright
            Agent:
          </P>
          <div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-1">
            <p className="font-semibold text-foreground">
              Copyright Agent — {OPERATOR}
            </p>
            <p>
              Email:{" "}
              <a
                href={`mailto:${DMCA_EMAIL}`}
                className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              >
                {DMCA_EMAIL}
              </a>
            </p>
            <p>
              General contact:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
            <p>Jurisdiction: United Kingdom</p>
          </div>
          <P>
            We will process valid notices promptly. Upon receipt of a valid
            notice, we will remove or disable access to the allegedly infringing
            material and notify the user who posted it.
          </P>
        </Section>

        {/* 4. Counter-notice */}
        <Section
          id="counter-notice"
          title="4. Counter-Notice Procedure"
          index={4}
        >
          <P>
            If you believe that content you posted was removed as a result of
            mistake or misidentification, you may submit a counter-notice to our
            Copyright Agent. Your counter-notice must include:
          </P>
          <Ul
            items={[
              "Your name, postal address, telephone number, and email address.",
              "Identification of the material that was removed and the location where it appeared before removal.",
              "A statement under penalty of perjury that you have a good faith belief that the material was removed as a result of mistake or misidentification.",
              "A statement that you consent to the jurisdiction of the Federal District Court for the judicial district in which your address is located (or, if your address is outside the United States, that you consent to the jurisdiction of any judicial district in which the service provider may be found or the courts of England and Wales), and that you will accept service of process from the person who provided the initial infringement notification or an agent of such person.",
              "Your physical or electronic signature.",
            ]}
          />
          <P>
            Upon receipt of a valid counter-notice, we will forward it to the
            original complainant. If the complainant does not notify us that
            they have filed a court action within 10–14 business days, we may
            restore the removed content at our discretion.
          </P>
        </Section>

        {/* 5. Repeat infringers */}
        <Section id="repeat-infringers" title="5. Repeat Infringer Policy" index={5}>
          <P>
            In accordance with the DMCA and applicable law, it is our policy to
            terminate, in appropriate circumstances, the accounts of users who
            are deemed to be repeat infringers. We reserve the right to
            terminate a user's account upon receipt of a single valid DMCA
            notice where the circumstances warrant it.
          </P>
        </Section>

        {/* 6. AI-generated content */}
        <Section
          id="ai-content"
          title="6. AI-Generated Content & Copyright"
          index={6}
        >
          <P>
            Our Service includes features that generate content using artificial
            intelligence (including text, images, and character responses). You
            are solely responsible for ensuring that any prompts you submit and
            any outputs you use or distribute comply with applicable copyright
            law and do not infringe the rights of any third party.
          </P>
          <P>
            AI-generated outputs may not be protected by copyright in all
            jurisdictions. We make no representations as to the copyright status
            of AI-generated outputs and disclaim all liability for any
            infringement claims arising from your use of such outputs.
          </P>
        </Section>

        {/* 7. User uploads */}
        <Section id="user-uploads" title="7. User-Uploaded Content" index={7}>
          <P>
            You represent and warrant that any content you upload to our
            cloud storage or otherwise submit through the Service:
          </P>
          <Ul
            items={[
              "Is owned by you or that you have the necessary rights and licences to upload and use it.",
              "Does not infringe the copyright, trademark, or other intellectual property rights of any third party.",
              "Does not contain any content that violates any applicable law or regulation.",
            ]}
          />
          <P>
            We reserve the right to remove any content that we determine, in our
            sole discretion, may infringe third-party rights, without prior
            notice.
          </P>
        </Section>

        {/* 8. Changes */}
        <Section
          id="changes"
          title="8. Changes to This Policy"
          index={8}
        >
          <P>
            We may update this DMCA & Copyright Policy from time to time. When
            we do, we will revise the "Last updated" date at the top of this
            page. Your continued use of the Service after any changes are posted
            constitutes your acceptance of the revised policy.
          </P>
        </Section>

        {/* 9. Contact */}
        <Section id="contact" title="9. Contact Us" index={9}>
          <P>
            For all copyright-related enquiries, please contact our designated
            Copyright Agent:
          </P>
          <div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-1">
            <p className="font-semibold text-foreground">{OPERATOR}</p>
            <p>
              DMCA / Copyright:{" "}
              <a
                href={`mailto:${DMCA_EMAIL}`}
                className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              >
                {DMCA_EMAIL}
              </a>
            </p>
            <p>
              General:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
            <p>Website: {SITE_URL}</p>
            <p>Jurisdiction: United Kingdom</p>
          </div>
        </Section>
      </div>
    </Layout>
  );
}
