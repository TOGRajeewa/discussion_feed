import * as React from 'react';
import { SPHttpClient } from '@microsoft/sp-http';
import { Callout, DirectionalHint } from 'office-ui-fabric-react/lib/Callout';
import { Persona, PersonaSize } from 'office-ui-fabric-react/lib/Persona';
import { Icon } from 'office-ui-fabric-react/lib/Icon';
import styles from './DiscussionFeed.module.scss';
import { searchPeople } from '../services/PeopleService';
import { IMentionUser } from '../models';

export interface IPeoplePickerFieldProps {
  spHttpClient: SPHttpClient;
  webUrl: string;
  selected: IMentionUser[];
  onChange: (people: IMentionUser[]) => void;
  placeholder: string;
  /** 'inline' = compact "Add people" row; 'box' = larger Praise field */
  variant?: 'inline' | 'box';
}

export interface IPeoplePickerFieldState {
  query: string;
  results: IMentionUser[];
  open: boolean;
}

let ppfSeq: number = 0;

export class PeoplePickerField extends React.Component<IPeoplePickerFieldProps, IPeoplePickerFieldState> {
  private anchorId: string = `df-ppf-${ppfSeq++}`;
  private timer: any = null;

  constructor(props: IPeoplePickerFieldProps) {
    super(props);
    this.state = { query: '', results: [], open: false };
  }

  private onType = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const q: string = e.target.value;
    this.setState({ query: q });
    if (this.timer) { clearTimeout(this.timer); }
    if (q.trim().length < 2) { this.setState({ results: [], open: false }); return; }
    this.timer = setTimeout(async () => {
      try {
        const people: IMentionUser[] = await searchPeople(this.props.spHttpClient, this.props.webUrl, q.trim());
        const chosen: { [k: string]: boolean } = {};
        this.props.selected.forEach((p: IMentionUser) => { chosen[p.loginName] = true; });
        this.setState({ results: people.filter((p: IMentionUser) => !chosen[p.loginName]), open: true });
      } catch (err) {
        this.setState({ results: [], open: false });
      }
    }, 250);
  }

  private add = (p: IMentionUser): void => {
    this.props.onChange(this.props.selected.concat([p]));
    this.setState({ query: '', results: [], open: false });
  }

  private remove = (login: string): void => {
    this.props.onChange(this.props.selected.filter((p: IMentionUser) => p.loginName !== login));
  }

  public render(): JSX.Element {
    const boxCls: string = this.props.variant === 'box' ? styles.ppfBox : styles.ppfInline;
    return (
      <div className={`${styles.ppf} ${boxCls}`}>
        <div className={styles.ppfRow}>
          {this.props.variant !== 'box' &&
            <Icon iconName="PeopleAdd" className={styles.ppfLeadIcon} />}

          {this.props.selected.map((p: IMentionUser) => (
            <span className={styles.ppfChip} key={p.loginName}>
              <span className={styles.ppfChipDot}>{(p.title || '?').substring(0, 1).toUpperCase()}</span>
              {p.title}
              <Icon iconName="Cancel" className={styles.ppfChipX} onClick={() => this.remove(p.loginName)} />
            </span>
          ))}

          <input
            id={this.anchorId}
            className={styles.ppfInput}
            placeholder={this.props.selected.length === 0 ? this.props.placeholder : 'Add people'}
            value={this.state.query}
            onChange={this.onType}
          />
        </div>

        {this.state.open && this.state.results.length > 0 &&
          <Callout
            target={`#${this.anchorId}`}
            directionalHint={DirectionalHint.bottomLeftEdge}
            isBeakVisible={false}
            gapSpace={2}
            onDismiss={() => this.setState({ open: false })}
          >
            <div className={styles.ppfList}>
              {this.state.results.map((p: IMentionUser) => (
                <div
                  key={p.loginName}
                  className={styles.ppfOption}
                  onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => { e.preventDefault(); this.add(p); }}
                >
                  <Persona primaryText={p.title} secondaryText={p.email} size={PersonaSize.size28} />
                </div>
              ))}
            </div>
          </Callout>}
      </div>
    );
  }
}
