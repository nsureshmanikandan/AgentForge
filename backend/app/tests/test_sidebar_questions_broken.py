from app.api.architect import _sidebar_questions_broken


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
