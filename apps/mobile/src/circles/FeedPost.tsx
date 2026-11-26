import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { REACTION_KEYS, type CirclePost, type ReactionKey } from "@fakkarni/shared";
import { fill, guessComment, guessCommentRemoved, guessReaction } from "@/circles/logic";
import { dateLocale, t } from "@/i18n";
import { commentPost, deleteComment, peekMe, reactPost } from "@/lib/api";
import { useGuess } from "@/lib/optimistic";
import { Chip, fonts, Icon, IconButton, notify, palette, plain, radius, space, Text, textStart, ZakiAvatar, type IconName } from "@/ui";

export const REACTION_ICON: Record<ReactionKey, IconName> = { heart: "heart", clap: "thumbs-up", laugh: "happy", pray: "flower", strong: "barbell" };
const ago = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", hour: "numeric", minute: "2-digit" });
const SHOWN = 3;

/** A comment that is still on its way to the server: it has no id there yet. */
const LOCAL = "local:";

/**
 * One thing that happened in the circle: Zaki's line, reactions, short comments, and an iftar
 * answer when it is one. A reaction or a comment shows at once (the post's own guess,
 * lib/optimistic.ts) and is sent behind; taps that follow each other go out in order.
 */
export function FeedPost({ circleId, post: fromList, extra, onChange }: { circleId: string; post: CirclePost; extra?: React.ReactNode; onChange: (p: CirclePost) => void }) {
  const { shown: post, run } = useGuess(fromList);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [all, setAll] = useState(false);

  const failed = () => notify(t.tasks.failed, "error");
  const react = (key: ReactionKey) => {
    // Decided on what is shown when the tap lands (a second tap on the same one takes it back).
    let wanted: ReactionKey | null = key;
    const next = (shown: CirclePost) => {
      wanted = shown.my_reaction === key ? null : key;
      return guessReaction(shown, wanted);
    };
    void run(() => reactPost(circleId, fromList.id, wanted), { next, adopt: (answer) => answer }).then(onChange, failed);
  };
  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    setWriting(false);
    const id = `${LOCAL}${Date.now()}`;
    void run(() => commentPost(circleId, fromList.id, body), { next: (shown) => guessComment(shown, body, peekMe()?.name ?? null, new Date(), id), adopt: (answer) => answer }).then(onChange, () => {
      // Not sent: the words go back into the box instead of being lost.
      failed();
      setText(body);
      setWriting(true);
    });
  };
  const remove = (commentId: string) => {
    let without: CirclePost | null = null;
    void run(() => deleteComment(circleId, commentId), { next: (shown) => (without = guessCommentRemoved(shown, commentId)) }).then(() => {
      if (without) onChange(without);
    }, failed);
  };

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
            {c.is_mine && !c.id.startsWith(LOCAL) ? <IconButton name="close" label={t.ui.removeComment} size={26} onPress={() => remove(c.id)} /> : null}
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
  // minWidth 0: in the browser a text box will not shrink below its natural width by itself, and pushed Send off the card.
  input: { flex: 1, minWidth: 0, minHeight: 40, backgroundColor: "rgba(255,255,255,0.75)", borderRadius: radius.pill, paddingHorizontal: space.lg, fontSize: 15, fontFamily: fonts.body, color: palette.ink },
  ask: { gap: space.sm },
});
