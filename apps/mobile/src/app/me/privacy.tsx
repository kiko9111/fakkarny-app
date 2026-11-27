import { Linking, Platform } from "react-native";
import { router, Stack } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { authAvailable, signOut } from "@/auth";
import { resetLocalData } from "@/db/reset";
import { language, t } from "@/i18n";
import { API_URL, deleteAccount, exportData } from "@/lib/api";
import { legalUrl } from "@/lib/api-url";
import { useAccount } from "@/me/useMe";
import { confirm, NavRow, notify, RowGroup, Screen } from "@/ui";

/** Privacy and my data: the account on this phone, export, the legal pages, and delete, last. */
export default function PrivacyScreen() {
  const m = t.lay.me;
  const [account, setAccount] = useAccount();

  const doExport = async () => {
    try {
      const data = await exportData();
      if (Platform.OS === "web") return notify(t.ui.exportPhone, "info");
      const file = new File(Paths.cache, `zaki-export-${data.exported_at.slice(0, 10)}.json`);
      file.create({ overwrite: true });
      file.write(JSON.stringify(data, null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
    } catch {
      notify(t.saved.offline, "error");
    }
  };

  const doDelete = () =>
    confirm(
      t.settings.delete,
      t.settings.confirm,
      async () => {
        try {
          await deleteAccount();
          await signOut();
          await resetLocalData();
          router.replace("/onboarding");
        } catch {
          notify(t.saved.offline, "error");
        }
      },
      t.settings.cancel,
      t.settings.deleteConfirm,
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: m.privacy }} />

      {authAvailable ? (
        <RowGroup title={m.account}>
          {account ? (
            <NavRow icon="log-out-outline" kind="neutral" title={t.settings.signOut} value={`${t.settings.signedInAs} ${account}`} onPress={() => void signOut().then(() => setAccount(null))} />
          ) : (
            <NavRow icon="log-in-outline" kind="neutral" title={t.settings.signIn} onPress={() => router.push("/onboarding")} />
          )}
        </RowGroup>
      ) : null}

      <RowGroup title={m.yourData}>
        <NavRow icon="download-outline" kind="neutral" title={t.settings.export} onPress={() => void doExport()} />
        <NavRow icon="document-text-outline" kind="neutral" title={t.paywall.termsLink} onPress={() => void Linking.openURL(legalUrl(API_URL, "terms", language))} />
        <NavRow icon="lock-closed-outline" kind="place" title={t.paywall.privacyLink} onPress={() => void Linking.openURL(legalUrl(API_URL, "privacy", language))} />
      </RowGroup>

      <RowGroup>
        <NavRow icon="trash-outline" title={t.settings.delete} danger onPress={doDelete} />
      </RowGroup>
    </Screen>
  );
}
