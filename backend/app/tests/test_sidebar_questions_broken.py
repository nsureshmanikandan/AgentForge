from app.api.architect import (
    _sidebar_questions_broken,
    _nav_items_broken,
    _duplicate_welcome_broken,
    _patch_duplicate_welcome,
    _patch_sidebar_questions,
    _find_matching_paren_close,
)


def test_not_flagged_when_no_topic_filter_feature():
    html = "<html><body>No topic filter here at all</body></html>"
    assert _sidebar_questions_broken(html) is False


def test_flagged_when_sidebar_questions_computed_but_never_rendered():
    html = """
    const [activeTopic, setActiveTopic] = React.useState(null);
    const TOPIC_QUESTIONS = { "Pay & Benefits": [] };
    const sidebarQuestions = activeTopic ? TOPIC_QUESTIONS[activeTopic] : FAQ_DATA;
    <button onClick={()=>setActiveTopic(activeTopic===topic?null:topic)}>{topic}</button>
    <button onClick={()=>setActiveTopic(null)}>Clear</button>
    """
    assert _sidebar_questions_broken(html) is True


def test_flagged_when_clear_control_missing_even_if_rendered():
    html = """
    const [activeTopic, setActiveTopic] = React.useState(null);
    const TOPIC_QUESTIONS = { "Pay & Benefits": [] };
    const sidebarQuestions = activeTopic ? TOPIC_QUESTIONS[activeTopic] : FAQ_DATA;
    sidebarQuestions.map((item, idx) => (<button key={item.id}>{item.question}</button>))
    """
    assert _sidebar_questions_broken(html) is True


def test_not_flagged_when_both_render_and_clear_present():
    html = """
    const [activeTopic, setActiveTopic] = React.useState(null);
    const TOPIC_QUESTIONS = { "Pay & Benefits": [] };
    const sidebarQuestions = activeTopic ? TOPIC_QUESTIONS[activeTopic] : FAQ_DATA;
    sidebarQuestions.map((item, idx) => (<button key={item.id}>{item.question}</button>))
    <button onClick={()=>setActiveTopic(null)}>Clear</button>
    """
    assert _sidebar_questions_broken(html) is False


def test_nav_items_not_flagged_when_no_multipage_nav():
    html = "<html><body>Single page app, no nav at all</body></html>"
    assert _nav_items_broken(html) is False


def test_nav_items_flagged_when_declared_but_never_rendered():
    html = """
    const navItems = [{ id: 'dashboard', label: 'Chat' }, { id: 'documents', label: 'Documents' }];
    const [activeNav, setActiveNav] = React.useState('dashboard');
    function renderMain() { if (activeNav === 'documents') return <div>Docs</div>; }
    """
    assert _nav_items_broken(html) is True


def test_nav_items_not_flagged_when_rendered_as_tabs():
    html = """
    const navItems = [{ id: 'dashboard', label: 'Chat' }, { id: 'documents', label: 'Documents' }];
    const [activeNav, setActiveNav] = React.useState('dashboard');
    navItems.map(item => (<button key={item.id} onClick={()=>setActiveNav(item.id)}>{item.label}</button>))
    """
    assert _nav_items_broken(html) is False


def test_duplicate_welcome_not_flagged_when_no_welcome_feature():
    html = "<html><body>No welcome message logic here at all</body></html>"
    assert _duplicate_welcome_broken(html) is False


def test_duplicate_welcome_flagged_when_seeded_and_rendered_statically():
    html = """
    const APP_CONFIG = { welcomeMessage: "Hi there" };
    const [messages, setMessages] = React.useState([{role:"bot", id:"bot_welcome", answer:APP_CONFIG.welcomeMessage}]);
    <div className="text-slate-700">{APP_CONFIG.welcomeMessage}</div>
    {messages.map((msg, idx) => (<div key={msg.id||idx}>{msg.answer}</div>))}
    """
    assert _duplicate_welcome_broken(html) is True


def test_duplicate_welcome_not_flagged_when_only_seeded_in_messages():
    html = """
    const APP_CONFIG = { welcomeMessage: "Hi there" };
    const [messages, setMessages] = React.useState([{role:"bot", id:"bot_welcome", answer:APP_CONFIG.welcomeMessage}]);
    {messages.map((msg, idx) => (<div key={msg.id||idx}>{msg.answer}</div>))}
    """
    assert _duplicate_welcome_broken(html) is False


def test_find_matching_paren_close_simple():
    html = "foo(bar)baz"
    assert _find_matching_paren_close(html, 3) == 8


def test_find_matching_paren_close_nested():
    html = "TOPICS.map(topic => (<button>{topic}</button>))tail"
    open_idx = html.index("(")
    close_idx = _find_matching_paren_close(html, open_idx)
    assert html[close_idx:] == "tail"


def test_patch_duplicate_welcome_removes_static_expression_only():
    html = (
        '<div className="avatar">&#128100;</div>'
        '<div className="text-slate-700">{APP_CONFIG.welcomeMessage}</div>'
        '{messages.map((msg, idx) => (<div key={msg.id||idx}>{msg.answer}</div>))}'
    )
    patched = _patch_duplicate_welcome(html)
    assert "{APP_CONFIG.welcomeMessage}" not in patched
    # The messages.map render path (the one real remaining copy) must survive untouched
    assert "messages.map((msg, idx) =>" in patched


def test_patch_duplicate_welcome_resolves_the_detector():
    html = """
    const APP_CONFIG = { welcomeMessage: "Hi there" };
    const [messages, setMessages] = React.useState([{role:"bot", id:"bot_welcome", answer:APP_CONFIG.welcomeMessage}]);
    <div className="text-slate-700">{APP_CONFIG.welcomeMessage}</div>
    {messages.map((msg, idx) => (<div key={msg.id||idx}>{msg.answer}</div>))}
    """
    assert _duplicate_welcome_broken(html) is True
    patched = _patch_duplicate_welcome(html)
    assert _duplicate_welcome_broken(patched) is False


def test_patch_sidebar_questions_inserts_working_render_and_resolves_detector():
    html = """
    const [activeTopic, setActiveTopic] = React.useState(null);
    const TOPIC_QUESTIONS = { "Pay & Benefits": [] };
    const sidebarQuestions = activeTopic ? TOPIC_QUESTIONS[activeTopic] : FAQ_DATA;
    <button onClick={()=>setActiveTopic(null)}>Clear</button>
    {APP_CONFIG.topics.map(topic => (
      <button key={topic} onClick={()=>setActiveTopic(activeTopic===topic ? null : topic)}>
        <span>{topic}</span>
      </button>
    ))}
    </aside>
    """
    assert _sidebar_questions_broken(html) is True
    patched = _patch_sidebar_questions(html)
    assert "sidebarQuestions.map(" in patched
    assert _sidebar_questions_broken(patched) is False
    # Inserted block must land after the topics map's closing brace, not inside it
    topics_close = patched.index("</aside>")
    assert patched.index("sidebarQuestions.map(") < topics_close


def test_patch_sidebar_questions_returns_unchanged_when_no_anchor_found():
    html = "const sidebarQuestions = activeTopic ? TOPIC_QUESTIONS[activeTopic] : FAQ_DATA;"
    assert _patch_sidebar_questions(html) == html
