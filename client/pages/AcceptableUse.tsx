import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Link } from "react-router-dom";

const LAST_UPDATED = "17 August 2026";
const CONTACT_EMAIL = "support@oxygenlow.com";
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

export default function AcceptableUse() {
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
            <ShieldAlert className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Acceptable Use Policy
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Last updated: {LAST_UPDATED} &nbsp;·&nbsp; Operated by{" "}
              <span className="font-medium text-foreground">{OPERATOR}</span>
              &nbsp;·&nbsp; United Kingdom
            </p>
          </div>
        </motion.div>

        {/* 1. Purpose */}
        <Section id="purpose" title="1. Purpose" index={1}>
          <P>
            This Acceptable Use Policy ("AUP") sets out the rules and standards
            that govern your use of the web application, desktop client, and all
            associated services operated by <strong>{OPERATOR}</strong>{" "}
            (collectively, the "Service"), available at{" "}
            <a
              href={SITE_URL}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              target="_blank"
              rel="noopener noreferrer"
            >
              {SITE_URL}
            </a>
            .
          </P>
          <P>
            This AUP supplements and is incorporated into our{" "}
            <Link
              to="/terms"
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link
              to="/eula"
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              End User Licence Agreement
            </Link>
            . Capitalised terms not defined here have the meanings given to them
            in those documents. By using the Service, you agree to comply with
            this AUP.
          </P>
        </Section>

        {/* 2. Prohibited conduct */}
        <Section
          id="prohibited-conduct"
          title="2. Prohibited Conduct"
          index={2}
        >
          <P>
            You must not use the Service — including its AI features, cloud
            storage, proxy/VPN, social features, and any other functionality —
            for any of the following purposes:
          </P>

          <div className="space-y-4">
            <div>
              <p className="font-semibold text-foreground">2.1 Illegal Activities</p>
              <Ul
                items={[
                  "Engaging in, facilitating, or promoting any activity that is unlawful under applicable local, national, or international law.",
                  "Distributing, transmitting, or storing content that is illegal in your jurisdiction or ours, including content that violates export control or sanctions laws.",
                  "Committing fraud, identity theft, phishing, or other deceptive practices.",
                ]}
              />
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.2 Harmful & Abusive Content
              </p>
              <Ul
                items={[
                  "Uploading, generating, or distributing content that is threatening, harassing, abusive, defamatory, discriminatory, or hateful on the basis of race, ethnicity, religion, gender, sexual orientation, disability, or any other protected characteristic.",
                  "Producing, distributing, or possessing content that sexualises minors (CSAM) in any form. Any such content will be immediately reported to the relevant authorities.",
                  "Inciting or glorifying violence, self-harm, or harm to others.",
                  "Stalking, doxxing, or otherwise invading the privacy of any person.",
                ]}
              />
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.3 Intellectual Property Violations
              </p>
              <Ul
                items={[
                  "Uploading or distributing content that infringes the copyright, trademark, patent, trade secret, or other intellectual property rights of any third party.",
                  "Using the Service to circumvent technological protection measures of any kind.",
                  "Reproducing, distributing, or publicly displaying copyrighted material without authorisation.",
                ]}
              />
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.4 Security & Infrastructure Abuse
              </p>
              <Ul
                items={[
                  "Attempting to probe, scan, or test the vulnerability of the Service or any related system or network.",
                  "Attempting to breach or circumvent any security, authentication, or access-control measures.",
                  "Introducing viruses, malware, ransomware, spyware, worms, Trojan horses, or any other harmful or disruptive code.",
                  "Conducting denial-of-service (DoS) or distributed denial-of-service (DDoS) attacks against the Service or any third party.",
                  "Using automated tools (bots, crawlers, scrapers) to access the Service at a volume or frequency that places unreasonable load on our infrastructure, without our prior written consent.",
                  "Using our security features, proxy endpoints, or APIs to intentionally disrupt legitimate third-party services, conduct unauthorized vulnerability testing, or stage distributed denial-of-service attacks.",
                ]}
              />
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.5 AI Feature Misuse
              </p>
              <Ul
                items={[
                  "Using AI features to generate content that is illegal, harmful, abusive, or in violation of this AUP.",
                  "Attempting to manipulate, jailbreak, or otherwise bypass the safety guidelines or content filters of any AI model or provider integrated with the Service.",
                  "Generating synthetic media (deepfakes, voice clones, etc.) designed to deceive, defraud, or defame any person.",
                  "Using AI outputs as the sole basis for making decisions that could have significant legal, medical, financial, or safety consequences without appropriate human oversight.",
                  "Violating the usage policies of any third-party AI provider whose services are integrated with the platform (OpenAI, Anthropic, Google, xAI, Cloudflare, OpenRouter, Stable Horde).",
                ]}
              />
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.6 Storage & Bandwidth Abuse
              </p>
              <Ul
                items={[
                  "Exceeding your allocated 30 MB cloud storage quota by any means, including by using multiple accounts.",
                  "Exceeding the 50 MB daily bandwidth limit for the VPN/proxy feature.",
                  "Using the Service's storage or bandwidth infrastructure to distribute commercial software, pirated content, or large files not intended for personal use.",
                ]}
              />
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.7 Account & Identity Misuse
              </p>
              <Ul
                items={[
                  "Creating multiple accounts to circumvent suspensions, bans, or usage limits.",
                  "Sharing, selling, transferring, or otherwise granting access to your account to any third party.",
                  "Impersonating any person or entity, or misrepresenting your identity or affiliation.",
                  "Providing false information during account registration or in communications with us.",
                ]}
              />
            </div>

            <div>
              <p className="font-semibold text-foreground">
                2.8 Spam & Unsolicited Communications
              </p>
              <Ul
                items={[
                  "Using the Service (including support tickets or social features) to send unsolicited bulk communications, advertising, or promotional content.",
                  "Using the Service to harvest or collect the personal information of other users without their consent.",
                ]}
              />
            </div>
          </div>
        </Section>

        {/* 3. Reporting */}
        <Section id="reporting" title="3. Reporting Violations" index={3}>
          <P>
            If you become aware of any content or behaviour on the Service that
            you believe violates this AUP, please report it to us immediately at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              {CONTACT_EMAIL}
            </a>
            . Please include as much detail as possible, including the specific
            content or behaviour, the location within the Service, and any
            relevant context.
          </P>
          <P>
            For copyright infringement specifically, please use our{" "}
            <Link
              to="/dmca"
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              DMCA & Copyright Policy
            </Link>{" "}
            reporting process.
          </P>
        </Section>

        {/* 4. Enforcement */}
        <Section id="enforcement" title="4. Enforcement" index={4}>
          <P>
            We reserve the right, in our sole discretion, to investigate any
            suspected violation of this AUP and to take any action we deem
            appropriate, including:
          </P>
          <Ul
            items={[
              "Issuing a warning.",
              "Removing or disabling access to content that violates this AUP.",
              "Temporarily suspending or permanently terminating your account.",
              "Reporting your conduct to law enforcement or other relevant authorities.",
              "Pursuing civil or criminal legal action.",
            ]}
          />
          <P>
            We are not obligated to monitor all content on the Service, but we
            reserve the right to do so. Our failure to enforce this AUP in any
            particular instance does not constitute a waiver of our right to
            enforce it in the future.
          </P>
        </Section>

        {/* 5. Consequences */}
        <Section
          id="consequences"
          title="5. Consequences of Violation"
          index={5}
        >
          <P>
            Violating this AUP may result in the immediate suspension or
            permanent termination of your account and access to the Service,
            without refund or notice where permitted by applicable law. You
            remain liable for any damages, losses, or legal costs incurred by
            us or third parties as a result of your violation.
          </P>
        </Section>

        {/* 6. Changes */}
        <Section id="changes" title="6. Changes to This Policy" index={6}>
          <P>
            We may update this Acceptable Use Policy from time to time by
            posting the revised version on this page with an updated "Last
            updated" date. If changes are material, we will make reasonable
            efforts to notify you (for example, via an in-app notice). Your
            continued use of the Service after changes become effective
            constitutes your acceptance of the revised AUP.
          </P>
        </Section>

        {/* 7. Contact */}
        <Section id="contact" title="7. Contact Us" index={7}>
          <P>
            If you have any questions about this Acceptable Use Policy, please
            contact us:
          </P>
          <div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-1">
            <p className="font-semibold text-foreground">{OPERATOR}</p>
            <p>
              Email:{" "}
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
