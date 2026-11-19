import { Placeholder } from "@/components/Placeholder";
import { language, t } from "@/i18n";

export default function SettingsScreen() {
  return <Placeholder title={t.settings.title} body={`${t.settings.language}: ${language}\n\n${t.settings.aiDisclosure}`} />;
}
