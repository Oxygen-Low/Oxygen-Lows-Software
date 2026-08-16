import { motion } from "framer-motion";
import { ScrollText } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Link } from "react-router-dom";

const LAST_UPDATED = "16 August 2026";
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

export default function Terms() {
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
            <ScrollText className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Terms of Use
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Last updated: {LAST_UPDATED} &nbsp;·&nbsp; Operated by{" "}
              <span className="font-medium text-foreground">{OPERATOR}</span>
              &nbsp;·&nbsp; United Kingdom
            </p>
          </div>
        </motion.div>

        {/* 1. Acceptance */}
        <Section id="acceptance" title="1. Acceptance of Terms" index={1}>
          <P>
            By accessing or using the web application and desktop client
            available at{" "}
            <a
              href={SITE_URL}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              target="_blank"
              rel="noopener noreferrer"
            >
              {SITE_URL}
            </a>{" "}
            (collectively, the "Service"), you agree to be bound by these Terms
            of Use ("Terms") and our{" "}
            <Link
              to="/privacy"
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Privacy Policy
            </Link>
            . If you do not agree to these Terms, you must not use the Service.
          </P>
          <P>
            These Terms constitute a legally binding agreement between you and{" "}
            <strong>{OPERATOR}</strong> ("we", "us", or "our"). We reserve the
            right to update these Terms at any time. Continued use of the
            Service after changes are posted constitutes your acceptance of the
            revised Terms.
          </P>
        </Section>

        {/* 2. Eligibility */}
        <Section id="eligibility" title="2. Eligibility" index={2}>
          <P>
            You must be at least 13 years old to use the Service. If you are
            between 13 and 18, you represent that you have obtained parental or
            guardian consent. Users in the UK or EEA must be at least 16 years
            old to consent to data processing, in accordance with UK GDPR
            Article 8. By using the Service you confirm that you meet the
            applicable age requirements.
          </P>
          <P>
            The Service is intended for personal, non-commercial use. Use of
            the Service is void where prohibited by applicable law.
          </P>
        </Section>

        {/* 3. Accounts */}
        <Section id="accounts" title="3. Accounts &amp; Registration" index={3}>
          <P>
            To access certain features you must create an account. You agree to:
          </P>
          <Ul
            items={[
              "Provide accurate and complete registration information.",
              "Keep your credentials confidential and not share them with any third party.",
              "Notify us immediately of any unauthorised access to your account.",
              "Be responsible for all activity that occurs under your account.",
            ]}
          />
          <P>
            We reserve the right to suspend or terminate your account if we
            believe that your account information is false, that you have
            violated these Terms, or for any other reason at our sole
            discretion.
          </P>
        </Section>

        {/* 4. Permitted use */}
        <Section id="permitted-use" title="4. Permitted Use" index={4}>
          <P>
            Subject to these Terms, we grant you a limited, non-exclusive,
            non-transferable, revocable licence to access and use the Service
            for your own personal, non-commercial purposes. You agree not to:
          </P>
          <Ul
            items={[
              "Use the Service for any unlawful purpose or in violation of any applicable laws or regulations.",
              "Upload, transmit, or distribute any content that is illegal, harmful, defamatory, obscene, or infringes any third-party rights.",
              "Attempt to gain unauthorised access to any part of the Service, its servers, or related systems.",
              "Use automated tools (bots, scrapers, crawlers) to access the Service without our prior written consent.",
              "Reverse-engineer, decompile, or disassemble any part of the Service.",
              "Exploit any Service feature (including the VPN/proxy or AI services) in a way that places unreasonable load on our infrastructure.",
              "Circumvent any security measures or usage limits imposed by the Service (e.g. storage quotas, bandwidth caps).",
              "Impersonate any person or entity, or misrepresent your affiliation with any person or entity.",
            ]}
          />
        </Section>

        {/* 5. User content */}
        <Section id="user-content" title="5. User Content" index={5}>
          <P>
            The Service allows you to upload files, create AI characters,
            submit support tickets, and store personal data ("User Content").
            You retain all ownership rights in your User Content. By submitting
            User Content to the Service, you grant us a limited, worldwide,
            royalty-free licence to host, store, and display your User Content
            solely as necessary to provide the Service.
          </P>
          <P>You are solely responsible for your User Content and represent that:</P>
          <Ul
            items={[
              "You own or have the necessary rights to submit the User Content.",
              "Your User Content does not violate any applicable law or third-party right.",
              "Your User Content does not contain any viruses, malware, or harmful code.",
            ]}
          />
          <P>
            We reserve the right (but are not obligated) to review, refuse, or
            remove any User Content that we determine, in our sole discretion,
            violates these Terms or is otherwise objectionable.
          </P>
        </Section>

        {/* 6. AI features */}
        <Section id="ai-features" title="6. AI Features" index={6}>
          <P>
            The Service provides access to various AI-powered tools, including a
            Chatbot, LLM Agent, image generation, and AI Characters. When you
            use these features:
          </P>
          <Ul
            items={[
              "Your inputs may be forwarded to third-party AI providers (see our Privacy Policy for the full list).",
              "AI-generated outputs are provided for informational and entertainment purposes only. We make no warranties as to their accuracy, completeness, or fitness for any particular purpose.",
              "You must not use AI features to generate content that is illegal, harmful, or in violation of any third-party AI provider's usage policies.",
              "We are not liable for any decisions you make based on AI-generated outputs.",
            ]}
          />
        </Section>

        {/* 7. Storage & bandwidth */}
        <Section
          id="storage-bandwidth"
          title="7. Storage &amp; Bandwidth Limits"
          index={7}
        >
          <P>
            Each account is provided with up to <strong>30 MB</strong> of cloud
            storage for personal files. The VPN/proxy feature is subject to a{" "}
            <strong>50 MB daily bandwidth limit</strong>. These limits may
            change at any time with reasonable notice. Exceeding these limits
            may result in temporary service restrictions or suspension of the
            relevant feature.
          </P>
          <P>
            We reserve the right to delete files or data that have been
            inactive for an extended period or that violate these Terms.
          </P>
        </Section>

        {/* 8. Defender & Security Services */}
        <Section
          id="defender-security"
          title="8. Defender &amp; Security Services"
          index={8}
        >
          <P>
            If you use our Defender security service or install the @oxygenlow/defender package on your 
            applications, you are responsible for configuring the service appropriately for your needs. 
            The service is designed to mitigate common web attacks, bots, and excessive traffic, but we 
            do not guarantee that it will prevent all security incidents or unauthorized access. You 
            agree that we are not liable for any security breaches, data loss, or service interruptions 
            that may occur despite your use of the Defender service.
          </P>
        </Section>

        {/* 9. Intellectual property */}
        <Section
          id="intellectual-property"
          title="9. Intellectual Property"
          index={9}
        >
          <P>
            All content, software, trademarks, logos, and other materials
            forming part of the Service (excluding User Content) are the
            exclusive property of <strong>{OPERATOR}</strong> or its licensors.
            Nothing in these Terms grants you any right to use our intellectual
            property without our prior written consent.
          </P>
          <P>
            The source code of the Service is made available under the licence
            terms stated in the project repository. Any use of the source code
            must comply with those licence terms.
          </P>
        </Section>

        {/* 10. Third-party services */}
        <Section
          id="third-party"
          title="10. Third-Party Services"
          index={10}
        >
          <P>
            The Service integrates with third-party services (including Supabase,
            OpenAI, Anthropic, Google, Cloudflare, and others listed in our
            Privacy Policy). Your use of those services is governed by their
            respective terms and privacy policies. We are not responsible for
            the availability, accuracy, or practices of any third-party service.
          </P>
        </Section>

        {/* 11. Disclaimers */}
        <Section id="disclaimers" title="11. Disclaimers" index={11}>
          <P>
            THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS
            WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
            INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS
            FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT
            THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
          </P>
          <P>
            The Service is in Open Beta. Features may change, be removed, or
            become temporarily unavailable without notice. We are not liable for
            any loss of data or interruption of service during the Beta period.
          </P>
        </Section>

        {/* 12. Limitation of liability */}
        <Section
          id="liability"
          title="12. Limitation of Liability"
          index={12}
        >
          <P>
            TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW,{" "}
            <strong>{OPERATOR.toUpperCase()}</strong> SHALL NOT BE LIABLE FOR
            ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
            DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED
            DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR
            OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR
            USE OF OR INABILITY TO USE THE SERVICE.
          </P>
          <P>
            In jurisdictions that do not allow the exclusion of certain
            warranties or limitation of liability, our liability will be limited
            to the greatest extent permitted by law.
          </P>
        </Section>

        {/* 13. Governing law */}
        <Section id="governing-law" title="13. Governing Law" index={13}>
          <P>
            These Terms are governed by and construed in accordance with the
            laws of England and Wales. Any disputes arising under or in
            connection with these Terms shall be subject to the exclusive
            jurisdiction of the courts of England and Wales, unless mandatory
            consumer protection laws in your country of residence provide
            otherwise.
          </P>
        </Section>

        {/* 14. Changes */}
        <Section id="changes" title="14. Changes to These Terms" index={14}>
          <P>
            We may update these Terms at any time by posting the revised version
            on this page with an updated "Last updated" date. If changes are
            material, we will make reasonable efforts to notify you (for example,
            via an in-app notice). Your continued use of the Service after
            changes become effective constitutes your acceptance of the revised
            Terms.
          </P>
        </Section>

        {/* 15. Termination */}
        <Section id="termination" title="15. Termination" index={15}>
          <P>
            We may suspend or terminate your access to the Service at any time,
            with or without notice, for any reason, including if we reasonably
            believe you have violated these Terms. You may terminate your account
            at any time by submitting an "Account Deletion Request" support
            ticket. Upon termination, your right to use the Service will
            immediately cease.
          </P>
        </Section>

        {/* 16. Contact */}
        <Section id="contact" title="16. Contact Us" index={16}>
          <P>
            If you have any questions about these Terms of Use, please contact
            us:
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
