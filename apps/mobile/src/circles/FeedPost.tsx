import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { REACTION_KEYS, type CirclePost, type ReactionKey } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { dateLocale, t } from "@/i18n";
import { commentPost, deleteComment, reactPost } from "@/lib/api";
import { Chip, fonts, Icon, IconButton, notify, palette, plain, radius, space, Text, textStart, ZakiAvatar, type IconName } from "@/ui";

export const REACTION_ICON: Record<ReactionKey, IconName> = { heart: "heart", clap: "thumbs-up", laugh: "happy", pray: "flower", strong: "barbell" };
const ago = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", hour: "numeric", minute: "2-digit" });
const SHOWN = 3;

/** One thing that happened in the circle: Zaki's line, reactions, short comments, and an iftar answer when it is one. */
export function FeedPost({ circleId, post, extra, onChange }: { circleId: string; post: CirclePost; extra?: React.ReactNode; onChange: (p: CirclePost) => void }) {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<CirclePost>) => {
    if (busy) return;
    setBusy(true);
    try {
      onChange(await fn());
    } catch {
      notify(t.tasks.failed, "error");
    } finally {
      setBusy(false);
    }
  };
  const react = (key: ReactionKey) => void act(() => reactPost(circleId, post.id, post.my_reaction === key ? null : key));
  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    setWriting(false);
    void act(() => commentPost(circleId, post.id, body));
  };
  const remove = (commentId: string) =>
    void act(async () => {
      await deleteComment(circleId, commentId);
      const comments = post.comments.filter((c) => c.id !== commentId);
      return { ...post, comments, comment_count: Math.max(0, post.comment_count - 1) };
    });

  const count = (key: string) => post.reactions.find((r) => r.key === key)?.count ?? 0;
  const comments = all ? post.comments : post.comments.slice(-SHOWN);

  return (
    <View style={styles.post}>
      <ZakiAvatar size={28} />
      <View style={styles.body}>
        <Text variant="body">{post.text}</Text>
        <Text variant="caption" color={palette.inkFaint}>
          {ago(post.created_at)}
        </Text>
        {extra}

        <View style={styles.reactions}>
          {REACTION_KEYS.map((key) => {
            const n = count(key);
            const mine = post.my_reaction === key;
            return (
              <Pressable
                key={key}
                onPress={() => react(key)}
                accessibilityRole="button"
                accessibilityLabel={t.ui.reactions[key]}
                accessibilityState={{ selected: mine }}
                style={[styles.reaction, mine && styles.reactionMine]}
                hitSlop={4}
              >
                <Icon name={REACTION_ICON[key]} size={15} color={mine ? palette.primaryInk : palette.inkSoft} />
                {n ? (
                  <Text variant="caption" color={mine ? palette.primaryInk : palette.inkSoft}>
                    {n}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          <Pressable onPress={() => setWriting((w) => !w)} accessibilityRole="button" accessibilityLabel={t.ui.comment} style={styles.reaction} hitSlop={4}>
            <Icon name="chatbubble-outline" size={15} color={palette.inkSoft} />
            <Text variant="caption" color={palette.inkSoft}>
              {post.comment_count || t.ui.comment}
            </Text>
          </Pressable>
        </View>

        {post.comment_count > comments.length && !all ? (
          <Pressable onPress={() => setAll(true)} accessibilityRole="button">
            <Text variant="smallStrong" color={palette.primaryInk}>
              {fill(t.ui.showAll, { n: post.comment_count })}
            </Text>
          </Pressable>
        ) : null}
        {comments.map((c) => (
          <View key={c.id} style={[styles.comment, c.is_zaki && styles.zakiComment]}>
            {c.is_zaki ? <ZakiAvatar size={20} /> : null}
            <Text variant="small" style={styles.flex}>
              <Text variant="smallStrong">{c.is_zaki ? t.ui.tabZaki : c.author_name ?? t.circles.noName}</Text>
              {"  "}
              {c.text}
            </Text>
            {c.is_mine ? <IconButton name="close" label={t.ui.removeComment} size={26} onPress={() => remove(c.id)} /> : null}
          </View>
        ))}

        {writing ? (
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={t.ui.commentPlaceholder}
              placeholderTextColor={palette.inkFaint}
              maxLength={200}
              textAlign={textStart}
              autoFocus
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <IconButton name="send" label={t.ui.send} color={palette.primary} onPress={send} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** The box at the top of the feed: ask Zaki for something in front of the circle. */
export function AskZakiBox({ onAsk }: { onAsk: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (value = text) => {
    const body = value.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onAsk(body);
      setText("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.ask}>
      <View style={styles.composer}>
        <ZakiAvatar size={28} />
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t.ui.askZaki}
          placeholderTextColor={palette.inkFaint}
          maxLength={200}
          textAlign={textStart}
          onSubmitEditing={() => void send()}
          returnKeyType="send"
          editable={!busy}
        />
        <IconButton name="send" label={t.ui.send} color={palette.primary} onPress={() => void send()} />
      </View>
      <View style={styles.reactions}>
        {t.ui.askIdeas.split("|").map((idea) => (
          <Chip key={idea} label={plain(idea)} onPress={() => void send(plain(idea))} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  body: { flex: 1, gap: 4, minWidth: 0 },
  flex: { flex: 1 },
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  reaction: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 9, minHeight: 28, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.6)" },
  reactionMine: { backgroundColor: palette.primarySoft },
  comment: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  zakiComment: { backgroundColor: "rgba(255,255,255,0.55)", borderRadius: radius.md, padding: space.xs },
  composer: { flexDirection: "row", alignItems: "center", gap: space.xs },
  input: { flex: 1, minHeight: 40, backgroundColor: "rgba(255,255,255,0.75)", borderRadius: radius.pill, paddingHorizontal: space.lg, fontSize: 15, fontFamily: fonts.body, color: palette.ink },
  ask: { gap: space.sm },
});
