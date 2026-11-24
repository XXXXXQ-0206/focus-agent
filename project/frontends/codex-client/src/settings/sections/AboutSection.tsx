import { ABOUT_APP_FACTS, ABOUT_BUILD_FACTS, ABOUT_RESTORED_FACTS, type AboutFact } from "../about-data";
import { SettingsCard, SettingsCardBody, SettingsSection } from "../SettingsRow";

function FactGrid({ facts }: { facts: AboutFact[] }) {
  return (
    <div className="cx-settings-about">
      {facts.map((fact) => (
        <div key={fact.key} style={{ display: "contents" }}>
          <span className="cx-settings-about__key">{fact.key}</span>
          <span className="cx-settings-about__value">
            {fact.mono ? <code>{fact.value}</code> : fact.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 关于 —— **官方没有这个分区**（docs/SPEC-SETTINGS.md §6 对账表 + §7.4）。
 *
 * 处理方式（SPEC §7.4 建议的第二档）：明确标注为「本还原工程附加页」，
 * 并且**不放进官方 3 组 18 条的导航顺序里** —— 它挂在最后的「还原工程（附加）」分组。
 * 官方对应的「关于信息」入口是**常规页第 12 行「打开源许可证」+「查看」按钮**，
 * 本工程那行按钮打开的弹窗内容与这里同源（about-data.ts）。
 *
 * 版本信息全部来自解包档案 docs/BUILD-INFO.md（见 about-data.ts 的出处注释）。
 */
export function AboutSection() {
  return (
    <>
      <SettingsSection title="说明">
        <SettingsCard>
          <SettingsCardBody>
            <p className="cx-settings-note">
              官方 Focus Desktop 的设置导航里**没有「关于」分区**（SPEC §6 对账表末行）。
              这一页是本还原工程的附加页，放在「还原工程（附加）」分组里，不冒充官方分区；
              版本与许可证入口在官方那边属于「常规 → 打开源许可证」这一行。
            </p>
          </SettingsCardBody>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="应用">
        <SettingsCard>
          <SettingsCardBody>
            <FactGrid facts={ABOUT_APP_FACTS} />
          </SettingsCardBody>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="构建">
        <SettingsCard>
          <SettingsCardBody>
            <FactGrid facts={ABOUT_BUILD_FACTS} />
          </SettingsCardBody>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="本还原工程">
        <SettingsCard>
          <SettingsCardBody>
            <FactGrid facts={ABOUT_RESTORED_FACTS} />
          </SettingsCardBody>
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
