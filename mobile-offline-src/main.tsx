              : localCopy
                ? copy.refreshLocalCopy
                : copy.saveLocalCopy}
          </button>
        )}
      />
    );
  }
  const bottomNavigationItems: [
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
    MobileBottomNavigationItem,
  ] = [
    {
      id: "home",
      label: copy.home,
      icon: "home",
      active: screen.kind === "guides" || screen.kind === "guide-detail",
      onSelect: () => setScreen({ kind: "guides" }),
    },
    {
      id: "following",
      label: copy.follow,
      icon: "follow",
      onSelect: () => setScreen({ kind: "cloud" }),
    },
    {
      id: "market",
      label: copy.market,
      icon: "store",
      onSelect: () => setScreen({ kind: "cloud" }),
    },
    {
      id: "me",
      label: copy.me,
      icon: "user",
      active: !["guides", "guide-detail", "cloud"].includes(screen.kind),
      onSelect: goList,
    },
  ];

  if (loading) {
    return <main className="offline-shell loading">{copy.loading}</main>;
  }

  return (
    <main className="offline-shell">
      <MobilePageHeaderView
        className="android-shell-header"
        title={copy.mySpace}
        titleText={copy.mySpace}
        showBack={false}
        ariaLabel={copy.mySpace}
        right={(
          <div className="header-actions">
            {!owner ? (
              <button className="icon-button" type="button" onClick={toggleLanguage}>
                {language === "zh" ? "EN" : "中文"}
              </button>
            ) : null}
            <button
              className="icon-button"
              type="button"
              aria-label={copy.settings}
              onClick={() => setScreen({ kind: "settings" })}
            >
              <UiIcon name="menu" size={22} />
            </button>
          </div>
        )}
      />

      {online && pendingSync.find((item) => item.should_prompt) ? (() => {
        const pending = pendingSync.find((item) => item.should_prompt)!;
        return (
          <section className="notice warning">
            <strong>{copy.pendingUpload}</strong>
            <p>{pending.title}</p>
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                disabled={syncingArchiveId === pending.local_archive_id}
                onClick={() => void uploadPending(pending.local_archive_id)}
              >
                {syncingArchiveId === pending.local_archive_id ? copy.uploading : copy.uploadNow}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void deferPending(pending.local_archive_id)}
              >
                {copy.later}
              </button>
            </div>
          </section>
        );
      })() : null}

      {migrationWarning ? (
        <section className="notice warning"><p>{copy.migrationWarning}</p></section>