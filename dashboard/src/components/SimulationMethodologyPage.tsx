import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  Database,
  FlaskConical,
  Gauge,
  GitBranch,
  Info,
  MapPinned,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { simulationApi } from "../services/simulationApi";

const navigation = [
  ["use-statement", "重要使用声明"],
  ["references", "参考文件目录"],
  ["model-provenance", "模型来源与行业应用"],
  ["calculation-flow", "计算流程"],
  ["source-methods", "泄漏源项方法"],
  ["dispersion-models", "扩散模型与路由"],
  ["consequence-zones", "后果分区方法"],
  ["conditions", "适用条件"],
  ["excluded", "不包含的情况"],
  ["traceability", "版本与追溯"],
] as const;

const references = [
  ["AQ/T 3046-2013《化工企业定量风险评价导则》", "2013", "泄漏源项、扩散与事故后果计算依据", "主要方法依据"],
  ["GB 36894-2018《危险化学品生产装置和储存设施风险基准》", "2018", "风险评价范围和风险基准背景", "仅作边界参考，本期不计算个人风险、社会风险和 F-N 曲线"],
  ["User’s Manual for SLAB: An Atmospheric Dispersion Model for Denser-than-Air Releases", "EPA，1990", "重气扩散模型", "路由至 SLAB 时使用"],
  ["ALOHA 5.4.4 Technical Documentation，NOAA Technical Memorandum NOS OR&R 43", "2013", "源项、扩散方法及模型限制的对比资料", "技术说明参考，不是代码依赖"],
  ["ALOHA User’s Manual", "EPA/NOAA，2007", "应急模型使用方法与限制说明", "文档结构参考"],
  ["AIHA ERPG 数据", "以化学品记录中的版本为准", "ERPG-1/2/3 阈值", "直接用于后果分区，须逐项复核"],
  ["Pasquill-Gifford 扩散参数方法", "PG-AQ3046-1.0", "高斯模型的横向和垂直扩散尺度", "直接用于高斯计算"],
] as const;

export function SimulationMethodologyPage() {
  const [health, setHealth] = useState<{ slabAvailable: boolean; engineVersion: string }>();
  const [healthUnavailable, setHealthUnavailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    simulationApi.health()
      .then((value) => {
        if (mounted) setHealth(value);
      })
      .catch(() => {
        if (mounted) setHealthUnavailable(true);
      });
    return () => { mounted = false; };
  }, []);

  const engineVersion = health?.engineVersion ?? (healthUnavailable ? "无法读取" : "读取中…");
  const slabStatus = health ? (health.slabAvailable ? "当前平台可用" : "当前平台未安装") : (healthUnavailable ? "运行状态无法读取" : "正在检查…");

  return <main className="methodology-page">
    <header className="methodology-header">
      <a href="/simulation"><ArrowLeft size={18} />返回事故模拟</a>
      <div>
        <FlaskConical size={24} />
        <span>事故后果模拟计算方法与使用声明</span>
      </div>
      <span className="methodology-readonly"><BookOpen size={16} />只读说明</span>
    </header>

    <section className="methodology-hero">
      <div className="methodology-hero__copy">
        <span className="methodology-kicker">OFFLINE CONSEQUENCE MODEL</span>
        <h1>计算依据、适用边界与结果使用说明</h1>
        <p>仅用于事故后果快速评估。阅读本页不影响模拟功能，也不会保存确认记录。</p>
      </div>
      <div className="methodology-version-grid" aria-label="计算引擎版本摘要">
        <div><Gauge size={19} /><span>计算引擎<small>{engineVersion}</small></span></div>
        <div><GitBranch size={19} /><span>Gaussian 模型<small>PG-AQ3046-1.0</small></span></div>
        <div className={health?.slabAvailable ? "is-available" : "is-unavailable"}><Database size={19} /><span>EPA SLAB-1990<small>{slabStatus}</small></span></div>
        <div><Clock3 size={19} /><span>说明文档<small>版本 1.0 · 2026-07-21</small></span></div>
      </div>
    </section>

    <div className="methodology-layout">
      <nav className="methodology-nav" aria-label="说明章节">
        <strong>内容目录</strong>
        {navigation.map(([id, label], index) => <a href={`#${id}`} key={id}><em>{String(index + 1).padStart(2, "0")}</em>{label}</a>)}
      </nav>

      <article className="methodology-content">
        <section id="use-statement" className="methodology-section methodology-section--statement">
          <h2><ShieldAlert size={22} /><span><em>01</em>重要使用声明</span></h2>
          <div className="methodology-disclaimer-copy">
            <p>本系统依据用户录入的事故物质、设备状态、泄漏位置和气象条件，通过数学模型估算有毒有害气体泄漏后的浓度分布与事故后果分区。计算结果是在特定输入数据、物性数据和模型假设下得到的工程估算，不是现场实测结果，也不代表真实气体云团的精确边界。</p>
            <p>本系统仅用于事故后果快速评估、初步警戒范围研判、应急演练和辅助决策，不构成安全评价结论、行政许可依据、事故责任认定或独立的应急指挥命令，不得替代 CFD 模拟、依法开展的定量风险评价或具备资质人员的专业判断。</p>
            <p>不得仅凭本系统结果决定人员进入危险区域、解除警戒或实施救援。实际处置应结合现场气体检测、实时风向风速、报警信息、企业应急预案、道路通行条件和现场指挥命令。气象、泄漏状态或现场条件发生明显变化后，应修正输入并重新计算。</p>
            <p>输入参数、化学品物性、ERPG 阈值、气象数据、泄漏点位置或地图标定存在偏差时，结果可能发生显著变化。对于无法确定的参数，应由具备专业能力的人员采用有依据的保守取值，并进行多情景对比。本系统不保证计算结果与实际事故完全一致。</p>
          </div>
          <div className="methodology-warning-grid">
            <span><AlertTriangle size={17} />结果是辅助决策信息，不能作为唯一处置依据。</span>
            <span><AlertTriangle size={17} />ERPG 等值线不是绝对的“安全/危险分界线”。</span>
            <span><AlertTriangle size={17} />泄漏点附近可靠性较低，地图尖端仅表示影响区从源点闭合。</span>
          </div>
        </section>

        <section id="references" className="methodology-section">
          <h2><BookOpen size={22} /><span><em>02</em>参考文件目录</span></h2>
          <div className="methodology-table-wrap">
            <table>
              <thead><tr><th>参考文件</th><th>年份/版本</th><th>页面标注的用途</th><th>与本期计算的关系</th></tr></thead>
              <tbody>{references.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="methodology-note"><Info size={17} />本页面仅列出参考资料名称及用途，不复制标准或第三方资料正文。化学品物性和 ERPG 阈值的实际来源、版本及复核记录，以本地化学品数据库中的记录为准。</p>
        </section>

        <section id="model-provenance" className="methodology-section methodology-section--provenance">
          <h2><BookOpen size={22} /><span><em>03</em>模型来源与行业应用</span></h2>
          <p className="methodology-provenance-intro">本系统采用的两类扩散模型均建立在公开、长期使用的工程扩散方法基础上，并可在美国环境保护署（EPA）、美国国家海洋和大气管理局（NOAA）发布的技术资料中找到同类模型的理论说明和应用记录。</p>
          <div className="methodology-provenance-grid">
            <div>
              <header><span>中性及非重气扩散</span><b>公开工程方法</b></header>
              <h3>Pasquill-Gifford 高斯模型</h3>
              <p>Pasquill 大气稳定度分类与 Gifford 经验扩散参数构成常用的高斯扩散方法，用于估算中性或近中性气体在下风向的浓度分布。</p>
              <ul>
                <li>EPA 与 NOAA 联合开发的 ALOHA 采用同类高斯模型处理非重气，并支持瞬时、连续和有限时长释放。</li>
                <li>EPA 资料显示，CAMEO/ALOHA 长期用于消防、应急规划、工业和高校等化学事故响应场景。</li>
                <li>本系统使用项目实现版本 <code>PG-AQ3046-1.0</code>，不是 ALOHA 软件或其源代码的复制。</li>
              </ul>
            </div>
            <div>
              <header><span>重气扩散</span><b>EPA 官方收录</b></header>
              <h3>EPA SLAB 模型</h3>
              <p>SLAB 通过质量、动量、组分、能量守恒方程和状态方程计算比空气重气体的扩散，可处理地面或高位喷射、液池蒸发和瞬时体积释放。</p>
              <ul>
                <li>EPA 的空气质量模型支持中心公开提供 SLAB 代码、可执行文件、测试案例、用户指南和模型评估报告。</li>
                <li>SLAB 具有公开技术文档和工程应用基础，本系统按重气判定条件调用本地平台版本。</li>
                <li>EPA 同时说明，模型被收录为替代模型不代表其取得特殊监管地位，具体应用仍需结合场景论证。</li>
              </ul>
            </div>
          </div>
          <p className="methodology-provenance-note"><ShieldAlert size={17} />上述信息说明模型方法具有公开来源、官方技术资料和行业应用基础，不表示 EPA、NOAA 或其他机构对本系统进行了测试、认证或背书。</p>
        </section>

        <section id="calculation-flow" className="methodology-section">
          <h2><GitBranch size={22} /><span><em>04</em>计算流程</span></h2>
          <div className="methodology-flow" aria-label="事故后果计算流程">
            {[
              "场景参数", "泄漏源强", "模型自动路由", "浓度场", "ERPG-1/2/3 分区", "2.5D 地图投影",
            ].map((item, index) => <span key={item}>{item}{index < 5 && <i>→</i>}</span>)}
          </div>
        </section>

        <section id="source-methods" className="methodology-section">
          <h2><FlaskConical size={22} /><span><em>05</em>泄漏源项方法</span></h2>
          <div className="methodology-card-grid">
            <div><b>加压气体孔泄漏</b><p>根据圆形等效孔面积、设备绝压、环境压力、物料温度、分子量和绝热指数计算孔口质量流率，并区分阻塞流与亚声速流。</p></div>
            <div><b>液化气闪蒸/液池</b><p>先计算液相孔口流量和闪蒸比例；剩余液体按地面热量蒸发与质量传递蒸发计算，蒸发量不超过可供液体质量。</p></div>
            <div><b>瞬时完全释放</b><p>将库存量作为一次性进入烟团的质量，不使用孔径、设备压力和隔离时间。</p></div>
          </div>
          <p className="methodology-formula">连续泄漏有效时间 = min（库存耗尽时间，隔离时间，3600 秒）</p>
        </section>

        <section id="dispersion-models" className="methodology-section">
          <h2><Gauge size={22} /><span><em>06</em>扩散模型与选择规则</span></h2>
          <div className="methodology-route">
            <div><strong>Gaussian</strong><span>气体密度 ≤ 空气密度</span><i>或</i><span>Richardson 数 &lt; 1</span></div>
            <div><strong>EPA SLAB</strong><span>气体密度 &gt; 空气密度</span><i>且</i><span>Richardson 数 ≥ 1</span></div>
          </div>
          <ul>
            <li>高斯模型对连续源采用烟羽计算，对瞬时源采用烟团计算，并考虑地面反射、释放高度、风速、稳定度和地表粗糙度。</li>
            <li>SLAB 用于重气地面或高位喷射、液池蒸发及瞬时体积释放。若经许可复核的 SLAB 可执行文件未安装或运行失败，计算明确终止，不自动退回高斯模型。</li>
            <li>每次运行记录气体密度、空气密度、摩擦速度、Richardson 数、路由结果和模型版本。</li>
          </ul>
        </section>

        <section id="consequence-zones" className="methodology-section">
          <h2><MapPinned size={22} /><span><em>07</em>后果分区方法</span></h2>
          <ul>
            <li>ERPG 阈值来自本地化学品记录，必须同时保存数值、单位、来源和版本。</li>
            <li>系统按当前环境温度和压力将 ppm 换算为质量浓度。</li>
            <li>分别计算 ERPG-3、ERPG-2、ERPG-1 等值范围，并生成红、黄、蓝三级嵌套多边形。</li>
            <li>最大包络表示计算时段内任一时刻可能达到相应阈值的范围，不代表整个区域在同一时刻同时达到该浓度。</li>
            <li>2.5D 地图只负责坐标投影和空间相交，不计算地形、建筑物或设备对气流的影响。</li>
          </ul>
        </section>

        <section id="conditions" className="methodology-section">
          <h2><CheckCircle2 size={22} /><span><em>08</em>适用条件</span></h2>
          <ul className="methodology-check-list">
            <li>单一泄漏源、单一非反应性有毒物质。</li>
            <li>室外、相对平坦且开阔的地形。</li>
            <li>风速不低于 <code>0.5 m/s</code>，Pasquill 稳定度已经人工确认。</li>
            <li>风速、风向和其他气象条件在单次计算期间保持不变。</li>
            <li>设备压力使用绝对压力，输入单位符合页面标注的 SI 单位。</li>
            <li>地图完成不少于四个控制点和独立校验点标定，最大校验误差不超过 <code>5 m</code>。</li>
            <li>当前高斯浓度搜索范围上限约为 <code>20 km</code>，逐时结果最长显示 <code>60 min</code>；达到计算边界不等于实际影响在该处终止。</li>
          </ul>
        </section>

        <section id="excluded" className="methodology-section methodology-section--excluded">
          <h2><AlertTriangle size={22} /><span><em>09</em>不包含的情况</span></h2>
          <p>本系统不模拟以下复杂场景：</p>
          <div className="methodology-tag-list">
            <span>火灾、爆炸、热辐射和爆炸碎片</span>
            <span>化学反应、燃烧产物及多组分混合物</span>
            <span>复杂地形、山谷导流和明显高程变化</span>
            <span>建筑物绕流、下洗、街道峡谷和室内扩散</span>
            <span>颗粒物、沉降、地面吸附和复杂湿化反应</span>
            <span>多个泄漏源同时叠加</span>
            <span>泄漏口附近的精细喷射流场及可替代 CFD 的三维结果</span>
          </div>
        </section>

        <section id="traceability" className="methodology-section">
          <h2><Database size={22} /><span><em>10</em>版本与追溯</span></h2>
          <ul>
            <li>当前计算引擎：<code>{engineVersion}</code>；Gaussian 模型：<code>PG-AQ3046-1.0</code>；重气模型：<code>EPA-SLAB-1990</code>。</li>
            <li>每次计算保存原始输入、SI 标准化参数、化学品版本、气象来源、人工修正状态、模型路由、结果和错误信息。</li>
            <li>说明文档版本 <code>1.0</code>，适用计算引擎 <code>1.0.x</code>，复核日期 <code>2026-07-21</code>。</li>
          </ul>
        </section>

        <footer className="methodology-footer">事故后果模拟计算方法与使用声明 · 文档版本 1.0</footer>
      </article>
    </div>
  </main>;
}
