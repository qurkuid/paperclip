import { useState, type FormEvent } from "react";
import { usePluginAction, usePluginData, useHostNavigation, type PluginSidebarProps, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { ROUTE_PATH } from "../manifest.js";

type Health = { publishingPaused: boolean; token: "configured" | "missing"; userIdConfigured: boolean };
type Content = { id: string; body: string; revision: number; status: string; approval_status: string; scheduled_at_utc: string | null; last_error_code: string | null };

export function AutoThreadsSidebar({ context }: PluginSidebarProps) {
  const navigation = useHostNavigation();
  return <a {...navigation.linkProps(`/${ROUTE_PATH}`)}>autoTHREADS</a>;
}

function HealthPanel({ companyId }: { companyId: string | null }) {
  const { data, loading, error } = usePluginData<Health>("autothreads-health", { companyId });
  if (loading) return <p>상태 확인 중…</p>;
  if (error || !data) return <p>상태를 확인할 수 없습니다. 설정을 확인해 주세요.</p>;
  return <dl>
    <dt>발행</dt><dd>{data.publishingPaused ? "중지됨" : "승인된 예약만 허용"}</dd>
    <dt>토큰</dt><dd>{data.token === "configured" ? "연결됨" : "연결 필요"}</dd>
    <dt>계정</dt><dd>{data.userIdConfigured ? "연결됨" : "연결 필요"}</dd>
  </dl>;
}

function ContentList({ data, loading, error, refresh, companyId }: { data: Content[] | null | undefined; loading: boolean; error: unknown; refresh: () => void; companyId: string | null }) {
  const transition = usePluginAction("content-transition");
  const [message, setMessage] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, string>>({});
  if (loading) return <p>초안을 불러오는 중…</p>;
  if (error || !data) return <p>초안을 불러올 수 없습니다.</p>;
  async function run(content: Content, action: string, decision?: "approve" | "reject") {
    try {
      const scheduledAtUtc = action === "schedule" && scheduleAt[content.id] ? new Date(scheduleAt[content.id]).toISOString() : undefined;
      await transition({ companyId, contentId: content.id, action, expectedRevision: content.revision, scheduledAtUtc, decision, body: action === "edit" ? editing[content.id] : undefined });
      setEditing((current) => { const { [content.id]: _, ...next } = current; return next; });
      setMessage("변경했습니다.");
      refresh();
    } catch {
      setMessage("변경하지 못했습니다. 권한과 최신 상태를 확인해 주세요.");
    }
  }
  return <section>
    <h2>초안과 승인</h2>
    {message ? <p role="status">{message}</p> : null}
    {data.length === 0 ? <p>아직 초안이 없습니다.</p> : <ul>{data.map((content) => <li key={content.id}>
      {editing[content.id] === undefined ? <p>{content.body}</p> : <textarea value={editing[content.id]} maxLength={500} onChange={(event) => setEditing((current) => ({ ...current, [content.id]: event.target.value }))} />}
      <p>상태: {content.status} · 승인: {content.approval_status}</p>
      {content.last_error_code ? <p>확인 필요: {content.last_error_code}</p> : null}
      {["DRAFT", "IN_REVIEW", "SCHEDULED"].includes(content.status) ? (editing[content.id] === undefined ? <button type="button" onClick={() => setEditing((current) => ({ ...current, [content.id]: content.body }))}>수정</button> : <><button type="button" onClick={() => run(content, "edit")}>수정 저장</button><button type="button" onClick={() => setEditing((current) => { const { [content.id]: _, ...next } = current; return next; })}>수정 취소</button></>) : null}
      {content.status === "DRAFT" ? <button type="button" onClick={() => run(content, "submit-review")}>검토 요청</button> : null}
      {content.status === "IN_REVIEW" && content.approval_status !== "REVIEWED" ? <><button type="button" onClick={() => run(content, "review", "approve")}>검토 통과</button><button type="button" onClick={() => run(content, "review", "reject")}>검토 반려</button></> : null}
      {content.status === "IN_REVIEW" && content.approval_status === "REVIEWED" ? <button type="button" onClick={() => run(content, "approve")}>최종 승인</button> : null}
      {content.status === "IN_REVIEW" && content.approval_status === "APPROVED" ? <label>예약 시간<input type="datetime-local" value={scheduleAt[content.id] ?? ""} onChange={(event) => setScheduleAt((current) => ({ ...current, [content.id]: event.target.value }))} /><button type="button" onClick={() => run(content, "schedule")}>예약</button></label> : null}
      {content.status === "IN_REVIEW" ? <button type="button" onClick={() => run(content, "rollback")}>초안으로 되돌리기</button> : null}
      {content.status === "SCHEDULED" ? <button type="button" onClick={() => run(content, "rollback")}>예약 취소</button> : null}
      {["DRAFT", "IN_REVIEW", "SCHEDULED", "FAILED"].includes(content.status) ? <button type="button" onClick={() => run(content, "cancel")}>취소</button> : null}
      {content.status === "FAILED" ? <button type="button" onClick={() => run(content, "retry")}>한 번 재시도</button> : null}
    </li>)}</ul>}
  </section>;
}

function DraftForm({ companyId, refresh }: { companyId: string | null; refresh: () => void }) {
  const createDraft = usePluginAction("create-draft");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await createDraft({ companyId, body, idempotencyKey: crypto.randomUUID() });
      setBody(""); setMessage("초안을 만들었습니다."); refresh();
    } catch { setMessage("초안을 만들지 못했습니다."); }
  }
  return <form onSubmit={submit}><label>새 초안<textarea value={body} maxLength={500} onChange={(event) => setBody(event.target.value)} /></label><button type="submit">초안 만들기</button>{message ? <p role="status">{message}</p> : null}</form>;
}

export function AutoThreadsPage({ context }: PluginWidgetProps) {
  const contents = usePluginData<Content[]>("autothreads-contents", { companyId: context.companyId });
  return <main><h1>autoTHREADS</h1><p>초안은 검토와 최종 승인을 거쳐 예약됩니다. 승인 없는 게시와 즉시 게시 기능은 제공하지 않습니다.</p><HealthPanel companyId={context.companyId} /><DraftForm companyId={context.companyId} refresh={contents.refresh} /><ContentList companyId={context.companyId} {...contents} /></main>;
}

export function AutoThreadsSettings({ context }: PluginWidgetProps) {
  return <section><h2>autoTHREADS 설정</h2><p>토큰 값은 이 화면에 표시되지 않습니다. 게시를 허용하려면 승인자·검토자와 예약 정책을 설정해야 합니다.</p><HealthPanel companyId={context.companyId} /></section>;
}
