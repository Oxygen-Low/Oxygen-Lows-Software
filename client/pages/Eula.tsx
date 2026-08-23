import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Link } from "react-router-dom";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";

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

export default function Eula() {
  const { t } = useTranslation();
  usePageTitle(t("titles.eula", undefined, "End User Licence Agreement"), {
    description: "End User Licence Agreement for Oxygen Low's Software.",
  });

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
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              End User Licence Agreement
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Last updated: {LAST_UPDATED} &nbsp;·&nbsp; Operated by{" "}
              <span className="font-medium text-foreground">{OPERATOR}</span>
              &nbsp;·&nbsp; United Kingdom
            </p>
          </div>
        </motion.div>

        {/* 1. Acceptance */}
        <Section id="acceptance" title="1. Acceptance of This Agreement" index={1}>
          <P>
            This End User Licence Agreement ("EULA") is a legally binding
            contract between you ("User", "you", or "your") and{" "}
            <strong>{OPERATOR}</strong> ("Licensor", "we", "us", or "our")
            governing your access to and use of the software, web application,
            desktop client, and any associated documentation or services made
            available at{" "}
            <a
              href={SITE_URL}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              target="_blank"
              rel="noopener noreferrer"
            >
              {SITE_URL}
            </a>{" "}
            (collectively, the "Software").
          </P>
          <P>
            By installing, accessing, or using the Software, you confirm that
            you have read, understood, and agree to be bound by this EULA, our{" "}
            <Link
              to="/terms"
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Terms of Use
            </Link>
            , and our{" "}
            <Link
              to="/privacy"
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Privacy Policy
            </Link>
            . If you do not agree, you must immediately cease using the
            Software.
          </P>
        </Section>

        {/* 2. Grant of Licence */}
        <Section id="licence-grant" title="2. Grant of Licence" index={2}>
          <P>
            Subject to your compliance with this EULA, the Licensor grants you a
            limited, non-exclusive, non-transferable, non-sublicensable,
            revocable licence to:
          </P>
          <Ul
            items={[
              "Access and use the hosted web application through a supported browser.",
              "Download, install, and run the desktop client executable on a device you own or control, solely for your personal, non-commercial purposes.",
              "Use any Software features made available to your account tier.",
            ]}
          />
          <P>
            This licence governs the compiled application binaries, desktop installer,
            and hosted platform. The underlying source code of the project and published
            packages (including @oxygenlow/webdefender) are licensed under the MIT License.
            All proprietary rights in trademarks, branding, and hosted infrastructure not
            expressly granted herein remain with the Licensor.
          </P>
        </Section>

        {/* 3. Restrictions */}
        <Section id="restrictions" title="3. Licence Restrictions" index={3}>
          <P>
            Except as expressly permitted by applicable open-source licences (such as the
            MIT License governing the source code) or mandatory applicable law, you
            must not, and must not permit any third party to:
          </P>
          <Ul
            items={[
              "Resell, rent, lease, sublicense, or commercially redistribute the compiled desktop installer or application binaries.",
              "Attempt to circumvent or disable any security features, authentication mechanisms, or access-control measures of the Software.",
              "Remove or alter any proprietary notices, copyright marks, or branding displayed within the Software.",
              "Use the Software or its connected services to provide commercial service bureau operations without our prior written consent.",
              "Use the Software in any manner that violates applicable law, regulations, or our Acceptable Use Policy.",
            ]}
          />
        </Section>

        {/* 4. Ownership */}
        <Section id="ownership" title="4. Ownership & Intellectual Property" index={4}>
          <P>
            The Software application, desktop binaries, branding, trademarks, and
            hosted services are licensed, not sold. The Licensor retains all
            intellectual property rights in and to these proprietary elements.
          </P>
          <P>
            Where portions of the Software are made available as open-source
            software in the project repository under the MIT License,
            your rights in the source code form are governed by the MIT License. This EULA
            governs the compiled desktop binaries, official installers, and connection to our
            cloud infrastructure.
          </P>
        </Section>

        {/* 5. User Content */}
        <Section id="user-content" title="5. User-Generated Content &amp; Data" index={5}>
          <P>
            You retain ownership of any content you create, upload, or submit
            through the Software ("User Content"). By submitting User Content,
            you grant the Licensor a worldwide, royalty-free, non-exclusive
            licence to host, store, process, and display that content solely as
            necessary to operate and provide the Software to you.
          </P>
          <P>
            You represent and warrant that you have all rights necessary to
            grant this licence and that your User Content does not infringe
            any third-party intellectual property rights, violate any applicable
            law, or breach any obligation of confidentiality.
          </P>
          <P>
            <strong>Zero-Knowledge Encryption:</strong> The Software uses Zero-Knowledge Client-Side 
            Encryption for sensitive User Content (such as character data, saves, and integrations). 
            You acknowledge that the Licensor does not hold your decryption keys and cannot decrypt your data. 
            The Licensor is not liable for any data loss arising from a forgotten password, lost <code>.key</code> file, 
            or compromised local device.
          </P>
        </Section>

        {/* 6. Updates */}
        <Section id="updates" title="6. Updates & Modifications" index={6}>
          <P>
            The Licensor may, from time to time, issue updates, patches, or new
            versions of the Software. Such updates may be applied automatically
            or may require your action. This EULA applies to all updates and
            supplements to the original Software unless a separate licence
            accompanies an update, in which case that separate licence governs.
          </P>
          <P>
            The Licensor reserves the right to modify, suspend, or discontinue
            any feature or the entire Software at any time, with or without
            notice, without liability to you.
          </P>
        </Section>

        {/* 7. Third-Party Components */}
        <Section
          id="third-party"
          title="7. Third-Party Software & Services"
          index={7}
        >
          <P>
            The Software may incorporate or interface with third-party software
            libraries, APIs, and services (including Supabase, OpenAI, Anthropic,
            Google, Cloudflare, and others). Your use of such third-party
            components is subject to their respective licence terms and privacy
            policies. The Licensor is not responsible for the availability,
            accuracy, or conduct of any third-party service.
          </P>
        </Section>

        {/* 8. Privacy */}
        <Section id="privacy" title="8. Privacy" index={8}>
          <P>
            Your use of the Software is subject to our{" "}
            <Link
              to="/privacy"
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Privacy Policy
            </Link>
            , which is incorporated into this EULA by reference. By using the
            Software, you consent to the collection and use of your information
            as described in the Privacy Policy.
          </P>
        </Section>

        {/* 9. Disclaimer */}
        <Section id="disclaimer" title="9. Disclaimer of Warranties" index={9}>
          <P>
            THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
            WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING, WITHOUT
            LIMITATION, ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, TITLE, OR NON-INFRINGEMENT. THE LICENSOR DOES
            NOT WARRANT THAT THE SOFTWARE WILL BE UNINTERRUPTED, TIMELY, SECURE,
            OR ERROR-FREE, OR THAT DEFECTS WILL BE CORRECTED.
          </P>
          <P>
            The Software is currently in Beta. Features, data, and
            availability may change without prior notice.
          </P>
        </Section>

        {/* 10. Limitation of Liability */}
        <Section
          id="liability"
          title="10. Limitation of Liability"
          index={10}
        >
          <P>
            Nothing in this EULA shall limit or exclude the Licensor's liability for
            death or personal injury caused by negligence, for fraud or fraudulent
            misrepresentation, or for any other liability that cannot lawfully be
            excluded or limited under applicable law, including non-excludable statutory
            rights under the UK Consumer Rights Act 2015.
          </P>
          <P>
            TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW,{" "}
            <strong>{OPERATOR.toUpperCase()}</strong> SHALL NOT BE LIABLE FOR
            ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR
            PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, USE,
            GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO
            YOUR USE OF OR INABILITY TO USE THE SOFTWARE, EVEN IF THE LICENSOR
            HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </P>
          <P>
            In jurisdictions that do not allow the exclusion or limitation of
            liability, the Licensor's liability will be limited to the greatest
            extent permitted by applicable law.
          </P>
        </Section>

        {/* 11. Indemnification */}
        <Section id="indemnification" title="11. Indemnification" index={11}>
          <P>
            You agree to indemnify, defend, and hold harmless the Licensor and
            its officers, directors, employees, and agents from and against any
            claims, liabilities, damages, judgments, awards, losses, costs,
            expenses, or fees (including reasonable legal fees) arising out of or
            relating to your violation of this EULA or your use of the Software,
            including your User Content.
          </P>
        </Section>

        {/* 12. Term & Termination */}
        <Section
          id="termination"
          title="12. Term & Termination"
          index={12}
        >
          <P>
            This EULA is effective from the date you first access or use the
            Software and continues until terminated. The Licensor may terminate
            this EULA and your licence immediately, with or without notice, if
            you breach any provision of this EULA.
          </P>
          <P>
            You may terminate this EULA at any time by ceasing all use of the
            Software and, where applicable, deleting your account. Upon
            termination for any reason, your licence rights will immediately
            cease and you must stop using the Software.
          </P>
          <P>
            Sections 4, 5, 9, 10, 11, 13, and 14 survive any termination of
            this EULA.
          </P>
        </Section>

        {/* 13. Governing Law */}
        <Section id="governing-law" title="13. Governing Law" index={13}>
          <P>
            This EULA is governed by and construed in accordance with the laws
            of England and Wales. Any disputes arising under or in connection
            with this EULA shall be subject to the exclusive jurisdiction of the
            courts of England and Wales, unless mandatory consumer protection
            laws in your country of residence require otherwise.
          </P>
        </Section>

        {/* 14. Contact */}
        <Section id="contact" title="14. Contact Us" index={14}>
          <P>
            If you have any questions about this End User Licence Agreement,
            please contact us:
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
